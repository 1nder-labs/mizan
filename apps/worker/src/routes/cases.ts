/**
 * Case routes mounted at `/api/cases`.
 *
 * Middleware order on `POST /:id/brief`:
 * 1. requireRole(["reviewer", "admin"])
 * 2. idempotencyKey (Layer 1 HTTP replay)
 * 3. producerGuard (Layer 2 workflow dedup — RUNNING for SSE, QUEUED for JSON)
 */

import { createBriefRun, flushLangfuse } from "@mizan/mastra";
import { toAISdkStream } from "@mastra/ai-sdk";
import { makeDb, transitionCase, type Case } from "@mizan/db";
import { BriefQueueMessageSchema } from "@mizan/shared";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { Context } from "hono";
import { Hono } from "hono";
import type { CloudflareBindings } from "../env.ts";
import { failCaseToFailed } from "../lib/fail-case.ts";
import { idempotencyKey } from "../middleware/idempotency-key.ts";
import { producerGuard, type ProducerVariables } from "../middleware/producer-guard.ts";
import { requireCaseAccess } from "../middleware/require-case-access.ts";
import { requireRole } from "../middleware/require-role.ts";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { actionRoutes } from "./actions.ts";
import { assignmentsRoutes } from "./assignments.ts";
import { caseDocumentsRoutes } from "./case-documents.ts";
import { caseNotesRoutes } from "./case-notes.ts";
import { caseStreamHandler } from "./case-stream.ts";
import { casesListRoutes } from "./cases-list.ts";
import { documentsRoutes } from "./documents.ts";
import { signalsRoutes } from "./signals.ts";

const StreamParamsSchema = z.object({ id: z.string().uuid() });

type BriefContext = Context<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables;
}>;

/**
 * Single read of the `Accept` header. Called once from the guard
 * dispatcher and once from `routeBriefPost`; the two reads operate on
 * the same request so they are deterministic, and the header lookup is
 * O(1) — duplicating the call is cheaper than threading a `c.set`
 * variable through `Variables`, which would require all middleware
 * shapes to declare the synthetic key.
 */
function wantsEventStream(c: BriefContext): boolean {
  const accept = c.req.header("Accept") ?? "";
  return accept.includes("text/event-stream");
}

/**
 * Flips the case to FAILED when a brief SSE stream finishes without the
 * workflow having advanced the row off RUNNING. The workflow self-transitions
 * to SUSPENDED_HITL on success, so the guarded transition
 * is a no-op there; only a genuinely stuck run — a step threw mid-stream, which
 * the workflow stream serialises as a silent `{ status: "failed" }` with no
 * error text — is failed + emitted. Without this the row sticks in RUNNING,
 * which `producerGuard("RUNNING")` rejects as a retry source, so the reviewer
 * could never re-brief and the case would be bricked. Aborts are skipped: the
 * client-disconnect path owns the revert to DRAFT.
 */
function failBriefRunIfStuck(c: BriefContext, caseId: string, runId: string): void {
  if (c.req.raw.signal.aborted) return;
  c.executionCtx.waitUntil(failCaseToFailed(makeDb(c.env.DB), caseId, runId));
}

async function streamBriefResponse(
  c: BriefContext,
  caseId: string,
  runId: string,
  caseRow: Case,
): Promise<Response> {
  const { run, requestContext, langfuse, tracingOptions } = await createBriefRun(c.env, {
    caseId,
    runId,
    reviewerId: c.var.viewer.userId,
    organizationId: caseRow.organization_id,
    category: caseRow.category,
    geography: caseRow.geography,
  });

  const onAbort = (): void => {
    void run.cancel();
  };
  c.req.raw.signal.addEventListener("abort", onAbort);

  try {
    const workflowStream = run.stream({
      inputData: { caseId, runId },
      requestContext,
      tracingOptions,
    });
    const aiSdkStream = toAISdkStream(workflowStream, { from: "workflow", version: "v6" });
    const uiStream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.merge(aiSdkStream);
      },
      onFinish: () => {
        flushLangfuse(langfuse, c.executionCtx);
        failBriefRunIfStuck(c, caseId, runId);
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream });
  } finally {
    c.req.raw.signal.removeEventListener("abort", onAbort);
    if (c.req.raw.signal.aborted) {
      await setCaseStatus(c.env, caseId, runId, "DRAFT");
    }
  }
}

/**
 * Pre-stream POST handler for `/api/cases/:id/brief`. Errors thrown
 * before SSE headers go out are caught here, the case is flipped to
 * FAILED so it surfaces in operator queries for stuck / broken cases,
 * and the response is redacted to a stable error envelope — the
 * underlying message stays in worker logs (Cloudflare observability
 * captures the throw) so on-call sees the failure without leaking
 * workflow internals to the reviewer. The producer guard accepts
 * FAILED as a retry-allowed source status, so the next POST simply
 * grabs a fresh runId. Mid-stream failures take the SSE error-event
 * path instead and never reach this catch.
 */
async function handleBriefPost(c: BriefContext): Promise<Response> {
  const caseId = c.req.param("id");
  if (!caseId) return c.json({ error: "case id missing" }, 400);
  const runId = c.get("runId");
  const caseRow = c.get("caseRow");
  try {
    return await streamBriefResponse(c, caseId, runId, caseRow);
  } catch (error) {
    await setCaseStatus(c.env, caseId, runId, "FAILED");
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[brief] workflow failed (case_id=${caseId} run_id=${runId}): ${message}`);
    return c.json({ error: "workflow_failed", case_id: caseId, run_id: runId }, 500);
  }
}

/**
 * Reverts a QUEUED claim back to DRAFT when the queue send fails.
 * The status guard ensures this is a no-op if a concurrent path already
 * moved the row off QUEUED (e.g. consumer claimed RUNNING, DLQ flipped
 * FAILED) — the row is no longer ours to revert. DRAFT is always a safe
 * revert because `producerGuard("QUEUED")` only accepts DRAFT or FAILED
 * source rows (see `ALLOWED_QUEUED_SOURCES`), so reverting cannot
 * downgrade a completed case.
 */
async function revertQueuedClaim(
  env: CloudflareBindings,
  caseId: string,
  runId: string,
): Promise<void> {
  await transitionCase(makeDb(env.DB), {
    caseId,
    runId,
    from: "QUEUED",
    to: "DRAFT",
  });
}

/**
 * Mode B producer — validates the queue message, enqueues to
 * `BRIEF_QUEUE`, and returns 202 with the pinned run id. Both the
 * schema parse and the send are wrapped in the same try so any
 * boundary failure triggers `revertQueuedClaim` and the QUEUED row
 * cannot orphan with no corresponding queue message.
 */
async function enqueueBrief(c: BriefContext): Promise<Response> {
  const caseId = c.req.param("id");
  if (!caseId) return c.json({ error: "case id missing" }, 400);

  const runId = c.get("runId");
  try {
    const message = BriefQueueMessageSchema.parse({
      caseId,
      runId,
      enqueuedAt: Date.now(),
      requestedBy: c.var.viewer.userId,
    });
    await c.env.BRIEF_QUEUE.send(message, { contentType: "json" });
  } catch (error) {
    await revertQueuedClaim(c.env, caseId, runId);
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[brief] enqueue failed (case_id=${caseId} run_id=${runId}): ${reason}`);
    return c.json({ error: "enqueue_failed", case_id: caseId, run_id: runId }, 500);
  }

  return c.json({ status: "QUEUED", run_id: runId, replay: false }, 202);
}

async function routeBriefPost(c: BriefContext): Promise<Response> {
  return wantsEventStream(c) ? handleBriefPost(c) : enqueueBrief(c);
}

const runningGuard = producerGuard("RUNNING");
const queuedGuard = producerGuard("QUEUED");

/**
 * ORDERING INVARIANT — `assignmentsRoutes` is registered BEFORE the
 * `requireCaseAccess` gate so it is exempt from it. Hono runs matched handlers
 * in registration order and stops when one returns a Response without calling
 * `next()`; the assign handler returns directly, so the later-registered
 * `.use("/:id/*", requireCaseAccess)` never executes for `POST /:id/assign`.
 * This is intentional: assign lets a reviewer SELF-CLAIM an unassigned case (the
 * queue's core flow), which the access gate — "a reviewer may only touch cases
 * assigned to them" — would otherwise 403. The assign route enforces its own
 * finer `self_assign_only` + org-scope policy.
 *
 * Every OTHER `/:id` data route MUST stay registered AFTER the two
 * `requireCaseAccess` `.use(...)` lines: anything registered before them is
 * silently ungated. Do not move a data route above this gate.
 */
export const caseRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables;
}>()
  .use("*", requireRole(["reviewer", "admin"]))
  .route("/", assignmentsRoutes)
  .use("/:id", requireCaseAccess)
  .use("/:id/*", requireCaseAccess)
  .route("/", casesListRoutes)
  .route("/", actionRoutes)
  .route("/", documentsRoutes)
  .route("/", caseDocumentsRoutes)
  .route("/", signalsRoutes)
  .route("/", caseNotesRoutes)
  .get("/:id/stream", zValidator("param", StreamParamsSchema), caseStreamHandler)
  .post(
    "/:id/brief",
    idempotencyKey,
    async (c, next) => (wantsEventStream(c) ? runningGuard(c, next) : queuedGuard(c, next)),
    routeBriefPost,
  );

/**
 * Updates `cases.status` on the request-boundary failure paths.
 * Both the runId guard and the `status='RUNNING'` guard ensure we only
 * mutate the case row whose run THIS handler started AND has not yet
 * advanced past RUNNING — a concurrent reviewer action or finalisation
 * that already reached SUSPENDED_HITL / ACTIONED is preserved.
 * Abort (client disconnect) → DRAFT so the reviewer can retry.
 * Pre-stream throw → FAILED so the row surfaces in operator queries
 * for stuck / broken cases instead of looking like a fresh draft.
 */
async function setCaseStatus(
  env: CloudflareBindings,
  caseId: string,
  runId: string,
  status: "DRAFT" | "FAILED",
): Promise<void> {
  await transitionCase(makeDb(env.DB), {
    caseId,
    runId,
    from: "RUNNING",
    to: status,
  });
}

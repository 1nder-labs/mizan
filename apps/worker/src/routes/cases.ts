/**
 * Case routes mounted at `/api/cases`.
 *
 * Brief generation is durable + resumable via a Durable Object
 * (`BriefStreamDO`): the reviewer's POST starts the run inside the DO and
 * returns a live SSE view; the run completes + persists regardless of the
 * client connection. `GET /:id/brief/stream` reconnects to the in-flight (or
 * finished) run for `useChat({ resume: true })`. There is no coupled "Mode A"
 * stream or "Mode B" queue any more — one durable path.
 *
 * Middleware order on `POST /:id/brief`:
 * 1. requireRole(["reviewer", "admin"])  (mounted on the router)
 * 2. requireCaseAccess                    (mounted on `/:id/*`)
 * 3. idempotencyKey                       (Layer 1 HTTP replay)
 * 4. aiDailyCap("brief")                  (global daily abuse cap)
 * 5. producerGuard("RUNNING")             (mints the runId, claims the case)
 */

import { cases, eq, makeDb, transitionCase } from "@mizan/db";
import { BriefQueueMessageSchema } from "@mizan/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { CloudflareBindings } from "../env.ts";
import { idempotencyKey } from "../middleware/idempotency-key.ts";
import { aiDailyCap } from "../middleware/ai-usage-cap.ts";
import { producerGuard, type ProducerVariables } from "../middleware/producer-guard.ts";
import { requireCaseAccess } from "../middleware/require-case-access.ts";
import { requireRole } from "../middleware/require-role.ts";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { actionRoutes } from "./actions.ts";
import { archiveRoutes } from "./archive.ts";
import { assignmentsRoutes } from "./assignments.ts";
import { caseDocumentsRoutes } from "./case-documents.ts";
import { caseNotesRoutes } from "./case-notes.ts";
import { caseStreamHandler } from "./case-stream.ts";
import { casesListRoutes } from "./cases-list.ts";
import { documentsRoutes } from "./documents.ts";
import { signalsRoutes } from "./signals.ts";

const StreamParamsSchema = z.object({ id: z.string().uuid() });

/**
 * SSE headers for the brief stream. `Content-Encoding: identity` opts out of
 * Cloudflare edge compression, which otherwise buffers the whole body before
 * flushing — defeating real-time streaming.
 */
const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Content-Encoding": "identity",
} as const;

type BriefContext = Context<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables;
}>;

/** Resolves the typed DO stub that owns a given run (one instance per `runId`). */
function briefStreamStub(env: CloudflareBindings, runId: string) {
  return env.BRIEF_STREAM.get(env.BRIEF_STREAM.idFromName(runId));
}

/**
 * Subscribes to the run's DO buffer (replay + live tail) and serves it as SSE.
 * The DO stub's `fetch` returns the workers-types `Response`; we re-pump its
 * bytes into a fresh global `ReadableStream` so the handler returns the global
 * `Response` Hono expects. Only `Uint8Array` crosses the boundary — universal
 * across the workers-types/DOM type split — so no cast is needed.
 */
async function subscribeResponse(env: CloudflareBindings, runId: string): Promise<Response> {
  const upstream = await briefStreamStub(env, runId).fetch("https://brief-stream/subscribe");
  const reader = upstream.body?.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!reader) {
        controller.close();
        return;
      }
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * Reverts a QUEUED claim back to DRAFT when the queue send fails, so a claimed
 * row can't orphan with no corresponding queue message. The status guard makes
 * it a no-op if a concurrent path already moved the row off QUEUED. DRAFT is a
 * safe revert: `producerGuard("QUEUED")` only accepts DRAFT/FAILED sources.
 */
async function revertQueuedClaim(c: BriefContext, caseId: string, runId: string): Promise<void> {
  await transitionCase(makeDb(c.env.DB), { caseId, runId, from: "QUEUED", to: "DRAFT" });
}

/**
 * Generate a brief. `producerGuard("QUEUED")` has minted `runId` + claimed the
 * case; we enqueue the run to the durable Mode-B consumer (which owns execution
 * + persistence, surviving any disconnect) and immediately return the DO's live
 * stream. The consumer pipes `run.stream()` into that same DO, so the reviewer
 * sees real-time steps without execution being coupled to this connection.
 */
async function startBriefRun(c: BriefContext): Promise<Response> {
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
    await revertQueuedClaim(c, caseId, runId);
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[brief] enqueue failed (case_id=${caseId} run_id=${runId}): ${reason}`);
    return c.json({ error: "enqueue_failed", case_id: caseId, run_id: runId }, 500);
  }
  return subscribeResponse(c.env, runId);
}

/**
 * Reconnects to the case's current run for `useChat({ resume: true })`. Replays
 * the buffered stream so far then tails live until it finishes. Returns 204 when
 * there is no active run (the client then shows the persisted brief). The DO
 * buffer makes this idempotent — reload mid-run and the steps reappear.
 */
async function resumeBriefStream(c: BriefContext): Promise<Response> {
  const caseId = c.req.param("id");
  if (!caseId) return c.json({ error: "case id missing" }, 400);
  const row = await makeDb(c.env.DB)
    .select({ runId: cases.current_run_id })
    .from(cases)
    .where(eq(cases.id, caseId))
    .get();
  if (!row?.runId) return new Response(null, { status: 204 });
  return subscribeResponse(c.env, row.runId);
}

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
  .route("/", archiveRoutes)
  .route("/", documentsRoutes)
  .route("/", caseDocumentsRoutes)
  .route("/", signalsRoutes)
  .route("/", caseNotesRoutes)
  .get("/:id/stream", zValidator("param", StreamParamsSchema), caseStreamHandler)
  .get("/:id/brief/stream", zValidator("param", StreamParamsSchema), resumeBriefStream)
  .post("/:id/brief", idempotencyKey, aiDailyCap("brief"), queuedGuard, startBriefRun);

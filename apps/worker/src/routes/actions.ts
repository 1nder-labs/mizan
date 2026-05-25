/**
 * Reviewer action route — resumes a suspended workflow run.
 *
 * Middleware order: `zValidator("param")` → `zValidator("json")` →
 * handler. The handler reads `c.req.valid("json")` directly to check
 * Layer 4 idempotency (no double parse). The route owns the atomic
 * SUSPENDED_HITL → RUNNING claim so concurrent reviewer submissions
 * see a stable 409 race-loser path. Resume failures revert the status
 * to SUSPENDED_HITL; a no-op revert (compensation hit a row that
 * already moved) is logged loud so on-call sees the divergence.
 */
import { zValidator } from "@hono/zod-validator";
import { createBriefRun } from "@mizan/mastra";
import { briefs, cases, desc, eq, makeDb, transitionCase, type Db } from "@mizan/db";
import {
  ActionErrorBodySchema,
  ReviewerActionRequestSchema,
  ReviewerActionResponseSchema,
  type ActionErrorCode,
  type BriefPayload,
  type ReviewerActionRequest,
  type ReviewerActionResponse,
} from "@mizan/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { cacheActionResponse, readCachedActionResponse } from "../lib/action-cache.ts";
import type { RoleVariables } from "../middleware/require-role.ts";

type ActionContext = Context<{ Bindings: CloudflareBindings; Variables: RoleVariables }>;

const ParamIdSchema = z.object({ id: z.string().uuid() });

function errorBody(code: ActionErrorCode): { error: ActionErrorCode } {
  return ActionErrorBodySchema.parse({ error: code });
}

async function loadLatestBrief(db: Db, caseId: string): Promise<BriefPayload | null> {
  const row = await db
    .select({ payload_json: briefs.payload_json })
    .from(briefs)
    .where(eq(briefs.case_id, caseId))
    .orderBy(desc(briefs.composed_at))
    .limit(1)
    .get();
  return row?.payload_json ?? null;
}

function buildResponse(
  brief: BriefPayload | null,
  body: ReviewerActionRequest,
): ReviewerActionResponse {
  return ReviewerActionResponseSchema.parse({ status: "success", brief, action: body });
}

/**
 * Compensation when `run.resume` throws after the claim succeeded.
 * `transitionCase` returns the updated row when the source-status
 * predicate matched; a `false` result means the case has already
 * advanced past RUNNING (concurrent revert, terminal flip, DLQ) — the
 * row is no longer ours to flip back and we must surface that loud so
 * on-call sees the divergence instead of swallowing it silently.
 */
async function revertClaim(db: Db, caseId: string, runId: string, cause: unknown): Promise<void> {
  const reverted = await transitionCase(db, {
    caseId,
    runId,
    from: "RUNNING",
    to: "SUSPENDED_HITL",
  });
  const reason = cause instanceof Error ? cause.message : String(cause);
  if (!reverted) {
    console.error(
      `[action] revertClaim no-op — case ${caseId} run ${runId} already off RUNNING (cause=${reason})`,
    );
    return;
  }
  console.error(`[action] resume failed — reverted claim (case=${caseId} run=${runId}): ${reason}`);
}

/**
 * Drives `run.resume` end-to-end. Either returns the parsed success
 * body OR revertClaims + returns a typed failure code. Mastra
 * `WorkflowResult.status` can be `failed | suspended | paused |
 * tripwire` without throwing — Phase 7 has a single HITL gate, so
 * anything other than `success` is a workflow defect: revert the
 * claim so the reviewer can retry, skip the KV cache so the failed
 * response is not pinned for 24h.
 */
async function resumeAndCommit(
  c: ActionContext,
  db: Db,
  caseRow: { category: string; geography: string },
  caseId: string,
  runId: string,
  body: ReviewerActionRequest,
): Promise<{ ok: true; response: ReviewerActionResponse } | { ok: false; code: ActionErrorCode }> {
  const { run, requestContext } = await createBriefRun(c.env, {
    caseId,
    runId,
    reviewerId: c.var.user.id,
    category: caseRow.category,
    geography: caseRow.geography,
  });
  try {
    const result = await run.resume({
      step: "awaitReviewerAction",
      resumeData: { ...body, reviewer_id: c.var.user.id },
      requestContext,
    });
    if (result.status !== "success") {
      await revertClaim(
        db,
        caseId,
        runId,
        new Error(`run.resume returned non-success status: ${result.status}`),
      );
      return { ok: false, code: "workflow_failed" };
    }
  } catch (error) {
    await revertClaim(db, caseId, runId, error);
    return { ok: false, code: "workflow_failed" };
  }
  const response = buildResponse(await loadLatestBrief(db, caseId), body);
  await cacheActionResponse(c.env.KV, c.var.user.id, caseId, body.action_id, response);
  return { ok: true, response };
}

export const actionRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: RoleVariables;
}>().post(
  "/:id/action",
  zValidator("param", ParamIdSchema),
  zValidator("json", ReviewerActionRequestSchema),
  async (c) => {
    const { id: caseId } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = makeDb(c.env.DB);

    const cached = await readCachedActionResponse(c.env.KV, c.var.user.id, caseId, body.action_id);
    if (cached) return c.json(cached);

    const caseRow = await db.select().from(cases).where(eq(cases.id, caseId)).get();
    if (!caseRow) return c.json(errorBody("not_found"), 404);
    if (!caseRow.current_run_id) return c.json(errorBody("no_run"), 409);
    const runId = caseRow.current_run_id;

    const claimed = await transitionCase(db, {
      caseId,
      runId,
      from: "SUSPENDED_HITL",
      to: "RUNNING",
    });
    if (!claimed) return c.json(errorBody("not_suspended_or_claimed"), 409);

    const outcome = await resumeAndCommit(c, db, caseRow, caseId, runId, body);
    if (!outcome.ok) return c.json(errorBody(outcome.code), 500);
    return c.json(outcome.response);
  },
);

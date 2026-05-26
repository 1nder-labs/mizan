/**
 * Reviewer action route — completes a SUSPENDED_HITL case inline.
 *
 * Middleware order: `zValidator("param")` → `zValidator("json")` →
 * handler. Layer 4 idempotency reads `c.req.valid("json")` directly
 * (no double parse). The route owns the atomic SUSPENDED_HITL →
 * RUNNING claim so concurrent reviewer submissions see a stable 409
 * race-loser path.
 *
 * After the claim succeeds, the route performs the post-action chain
 * inline (NOT via Mastra `run.resume`):
 *   1. `persistReviewerActionRow` — insert into `reviewer_actions`,
 *      idempotent on `action_id`
 *   2. `emitWorkflowEvent("step.resume")` — append to the tape
 *   3. `promoteEvalRow` — insert into `eval_promotions`, idempotent
 *      on `(run_id, action_id)`
 *   4. `transitionCase(RUNNING → ACTIONED)` — terminal status flip
 *   5. `emitWorkflowEvent("workflow.finish")` — terminal tape row
 *
 * Why inline: `Workflow.resume()` from a different request than the
 * original `Workflow.stream()` throws `Cannot perform I/O on behalf
 * of a different request` on Cloudflare Workers. The post-action
 * chain is three deterministic D1 writes — doesn't need Mastra's
 * parallelism / branching / step machinery, so direct DB calls keep
 * the route a single transaction surface that the runtime can
 * actually complete cross-request.
 *
 * Failure handling: any post-action throw triggers `revertClaim`,
 * flipping the case back to SUSPENDED_HITL so the reviewer can retry.
 * KV cache is only written on full success — a partial failure leaves
 * no replay-protected response.
 */
import { zValidator } from "@hono/zod-validator";
import { emitWorkflowEvent, promoteEvalRow } from "@mizan/mastra";
import {
  briefs,
  cases,
  desc,
  eq,
  makeDb,
  reviewer_actions,
  transitionCase,
  type Db,
} from "@mizan/db";
import {
  ActionErrorBodySchema,
  ReviewerActionRequestSchema,
  ReviewerActionResponseSchema,
  type ActionErrorCode,
  type BriefPayload,
  type Recommendation,
  type ReviewerAction,
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
const EMPTY_RATIONALE = "(none)";

function errorBody(code: ActionErrorCode): { error: ActionErrorCode } {
  return ActionErrorBodySchema.parse({ error: code });
}

function normalizeStoredRationale(rationale: string): string {
  const trimmed = rationale.trim();
  return trimmed.length > 0 ? trimmed : EMPTY_RATIONALE;
}

async function loadLatestBrief(
  db: Db,
  caseId: string,
): Promise<{ recommendation: Recommendation; payload: BriefPayload } | null> {
  const row = await db
    .select({
      recommendation: briefs.recommendation,
      payload_json: briefs.payload_json,
    })
    .from(briefs)
    .where(eq(briefs.case_id, caseId))
    .orderBy(desc(briefs.composed_at))
    .limit(1)
    .get();
  if (!row) return null;
  return { recommendation: row.recommendation, payload: row.payload_json };
}

function buildResponse(
  brief: BriefPayload | null,
  body: ReviewerActionRequest,
): ReviewerActionResponse {
  return ReviewerActionResponseSchema.parse({ status: "success", brief, action: body });
}

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
  console.error(
    `[action] post-action chain failed — reverted claim (case=${caseId} run=${runId}): ${reason}`,
  );
}

interface PostActionInput {
  readonly caseId: string;
  readonly runId: string;
  readonly reviewerId: string;
  readonly action: ReviewerAction;
  readonly rationale: string;
  readonly actionId: string;
}

async function runPostActionChain(db: Db, input: PostActionInput): Promise<BriefPayload> {
  const brief = await loadLatestBrief(db, input.caseId);
  if (!brief) {
    throw new Error(`action: brief row missing for case ${input.caseId} run ${input.runId}`);
  }
  await db
    .insert(reviewer_actions)
    .values({
      case_id: input.caseId,
      run_id: input.runId,
      reviewer_id: input.reviewerId,
      action: input.action,
      rationale: normalizeStoredRationale(input.rationale),
      action_id: input.actionId,
    })
    .onConflictDoNothing({ target: reviewer_actions.action_id });
  await emitWorkflowEvent(db, {
    caseId: input.caseId,
    runId: input.runId,
    eventType: "step.resume",
    stepId: "recordAction",
  });
  await promoteEvalRow(db, {
    caseId: input.caseId,
    runId: input.runId,
    actionId: input.actionId,
    recommendation: brief.recommendation,
    reviewerAction: input.action,
  });
  const flipped = await transitionCase(db, {
    caseId: input.caseId,
    runId: input.runId,
    from: "RUNNING",
    to: "ACTIONED",
  });
  if (!flipped) {
    throw new Error(`action: case ${input.caseId} not RUNNING at finalize (run ${input.runId})`);
  }
  await emitWorkflowEvent(db, {
    caseId: input.caseId,
    runId: input.runId,
    eventType: "workflow.finish",
  });
  return brief.payload;
}

async function commitAction(
  c: ActionContext,
  db: Db,
  caseId: string,
  runId: string,
  body: ReviewerActionRequest,
): Promise<{ ok: true; response: ReviewerActionResponse } | { ok: false; code: ActionErrorCode }> {
  let brief: BriefPayload;
  try {
    brief = await runPostActionChain(db, {
      caseId,
      runId,
      reviewerId: c.var.user.id,
      action: body.action,
      rationale: body.rationale,
      actionId: body.action_id,
    });
  } catch (error) {
    await revertClaim(db, caseId, runId, error);
    return { ok: false, code: "workflow_failed" };
  }
  const response = buildResponse(brief, body);
  try {
    await cacheActionResponse(c.env.KV, c.var.user.id, caseId, body.action_id, response);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[action] cacheActionResponse failed post-commit (case=${caseId}): ${reason}`);
  }
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

    const outcome = await commitAction(c, db, caseId, runId, body);
    if (!outcome.ok) return c.json(errorBody(outcome.code), 500);
    return c.json(outcome.response);
  },
);

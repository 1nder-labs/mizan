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
 * Failure handling: a post-action throw triggers `revertClaim`,
 * flipping the case back to SUSPENDED_HITL so the reviewer can retry.
 * KV cache is only written on full success — a partial failure leaves
 * no replay-protected response.
 */
import { zValidator } from "@hono/zod-validator";
import { emitWorkflowEvent, promoteEvalRow } from "@mizan/mastra";
import {
  and,
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
import { cacheActionResponse, tryReadCachedActionResponse } from "../lib/action-cache.ts";
import { finalizeActionWithLiveEvents, revertActionClaim } from "./action-live-events.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";

type ActionContext = Context<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>;

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
  organizationId: string,
): Promise<{ recommendation: Recommendation; payload: BriefPayload } | null> {
  const row = await db
    .select({
      recommendation: briefs.recommendation,
      payload_json: briefs.payload_json,
    })
    .from(briefs)
    .where(and(eq(briefs.case_id, caseId), eq(briefs.organization_id, organizationId)))
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

/**
 * Reverts a failed post-action claim back to SUSPENDED_HITL. Must never throw:
 * the caller is already handling a chain failure, and letting a revert D1 error
 * propagate would crash the request with a 500 AND leave the case stuck in
 * RUNNING. On revert failure we log loudly. There is no automatic backstop for
 * the action path — the queue consumer's `RUNNING_STALE_THRESHOLD_MS` sweep only
 * fires on a queued brief message, and a reviewer action is request-driven with
 * no such message. A double D1 fault (chain AND revert) therefore needs manual
 * recovery; it requires two independent failures in one request, so we accept
 * that residual risk rather than build a sweep for a path that has none.
 */
async function revertClaim(db: Db, caseId: string, runId: string, cause: unknown): Promise<void> {
  const reason = cause instanceof Error ? cause.message : String(cause);
  try {
    const reverted = await revertActionClaim(db, caseId, runId);
    if (!reverted) {
      console.error(
        `[action] revertClaim no-op — case ${caseId} run ${runId} already off RUNNING (cause=${reason})`,
      );
      return;
    }
    console.error(
      `[action] post-action chain failed — reverted claim (case=${caseId} run=${runId}): ${reason}`,
    );
  } catch (revertError) {
    const revertReason = revertError instanceof Error ? revertError.message : String(revertError);
    console.error(
      `[action] revertClaim FAILED — case ${caseId} run ${runId} may be stuck RUNNING (chain cause=${reason}, revert error=${revertReason})`,
    );
  }
}

interface PostActionInput {
  readonly caseId: string;
  readonly runId: string;
  readonly reviewerId: string;
  readonly organizationId: string;
  readonly action: ReviewerAction;
  readonly rationale: string;
  readonly actionId: string;
}

async function runPostActionChain(db: Db, input: PostActionInput): Promise<BriefPayload> {
  const brief = await loadLatestBrief(db, input.caseId, input.organizationId);
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
      organization_id: input.organizationId,
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
  await finalizeActionWithLiveEvents(db, {
    caseId: input.caseId,
    runId: input.runId,
    reviewerId: input.reviewerId,
    organizationId: input.organizationId,
    action: input.action,
    actionId: input.actionId,
  });
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
      reviewerId: c.var.viewer.userId,
      organizationId: c.var.viewer.organizationId,
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
    await cacheActionResponse(c.env.KV, c.var.viewer.userId, caseId, body.action_id, response);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[action] cacheActionResponse failed post-commit (case=${caseId}): ${reason}`);
  }
  return { ok: true, response };
}

export const actionRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>().post(
  "/:id/action",
  zValidator("param", ParamIdSchema),
  zValidator("json", ReviewerActionRequestSchema),
  async (c) => {
    const { id: caseId } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = makeDb(c.env.DB);

    const cached = await tryReadCachedActionResponse(
      c.env.KV,
      c.var.viewer.userId,
      caseId,
      body.action_id,
    );
    if (cached) return c.json(cached);

    const caseRow = await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.organization_id, c.var.viewer.organizationId)))
      .get();
    if (!caseRow) return c.json(errorBody("not_found"), 404);
    if (!caseRow.current_run_id) return c.json(errorBody("no_run"), 409);
    const runId = caseRow.current_run_id;

    const claimed = await transitionCase(db, {
      caseId,
      runId,
      from: ["SUSPENDED_HITL", "READY_FOR_REVIEW"],
      to: "RUNNING",
    });
    if (!claimed) return c.json(errorBody("not_suspended_or_claimed"), 409);

    const outcome = await commitAction(c, db, caseId, runId, body);
    if (!outcome.ok) return c.json(errorBody(outcome.code), 500);
    return c.json(outcome.response);
  },
);

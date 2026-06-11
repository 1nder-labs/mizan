/**
 * Reviewer action route — completes a SUSPENDED_HITL case inline.
 *
 * Middleware order: `zValidator("param")` → `zValidator("json")` → handler.
 * Layer 4 idempotency reads `c.req.valid("json")` directly (no double parse).
 * The route owns the HTTP concerns: cache replay, the atomic SUSPENDED_HITL →
 * RUNNING claim (so concurrent submissions see a stable 409 race-loser path),
 * and the success/KV-cache write. The post-claim domain chain — with its
 * must-commit vs best-effort tiers — lives in `post-action-pipeline.ts`.
 */
import { zValidator } from "@hono/zod-validator";
import {
  and,
  batchTransitionWithEmits,
  buildStatusChangedEmits,
  cases,
  eq,
  makeDb,
  type Db,
} from "@mizan/db";
import {
  ActionErrorBodySchema,
  ReviewerActionRequestSchema,
  type ActionErrorCode,
  type BriefPayload,
  type ReviewerActionRequest,
  type ReviewerActionResponse,
} from "@mizan/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { cacheActionResponse, tryReadCachedActionResponse } from "../lib/action-cache.ts";
import { buildResponse, revertClaim, runPostActionChain } from "./post-action-pipeline.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";

type ActionContext = Context<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>;

const ParamIdSchema = z.object({ id: z.string().uuid() });

function errorBody(code: ActionErrorCode): { error: ActionErrorCode } {
  return ActionErrorBodySchema.parse({ error: code });
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
    await revertClaim(db, caseId, runId, c.var.viewer.organizationId, error);
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
    if (caseRow.archived_at !== null) return c.json(errorBody("case_archived"), 409);
    if (!caseRow.current_run_id) return c.json(errorBody("no_run"), 409);
    const runId = caseRow.current_run_id;

    const claimed = await batchTransitionWithEmits(
      db,
      { caseId, runId, from: ["SUSPENDED_HITL"], to: "RUNNING", requireNotArchived: true },
      buildStatusChangedEmits({
        caseId,
        organizationId: c.var.viewer.organizationId,
        fromStatus: "SUSPENDED_HITL",
        toStatus: "RUNNING",
        actorUserId: c.var.viewer.userId,
      }),
    );
    if (!claimed) return c.json(errorBody("not_suspended_or_claimed"), 409);

    const outcome = await commitAction(c, db, caseId, runId, body);
    if (!outcome.ok) return c.json(errorBody(outcome.code), 500);
    return c.json(outcome.response);
  },
);

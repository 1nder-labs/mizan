/**
 * Reviewer action route — resumes a suspended workflow run.
 *
 * Middleware order: `zValidator("param")` → `zValidator("json")` →
 * `actionIdempotency` → handler. Validation runs FIRST so the
 * idempotency middleware short-circuits only on already-validated
 * payloads. The route owns the atomic SUSPENDED_HITL → RUNNING claim
 * (`transitionCase`) so concurrent reviewer submissions see a stable
 * 409 race-loser path. Resume failures are caught and revert the
 * status to SUSPENDED_HITL so the case never orphans in RUNNING with
 * no live workflow attached.
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
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { actionIdempotency, cacheActionResponse } from "../middleware/action-idempotency.ts";
import type { RoleVariables } from "../middleware/require-role.ts";

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
  status: ReviewerActionResponse["status"],
  brief: BriefPayload | null,
  body: ReviewerActionRequest,
): ReviewerActionResponse {
  return ReviewerActionResponseSchema.parse({ status, brief, action: body });
}

async function revertClaim(db: Db, caseId: string, runId: string): Promise<void> {
  await transitionCase(db, {
    caseId,
    runId,
    from: "RUNNING",
    to: "SUSPENDED_HITL",
  });
}

export const actionRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: RoleVariables;
}>().post(
  "/:id/action",
  zValidator("param", ParamIdSchema),
  zValidator("json", ReviewerActionRequestSchema),
  actionIdempotency,
  async (c) => {
    const { id: caseId } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = makeDb(c.env.DB);

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

    const { run, requestContext } = await createBriefRun(c.env, {
      caseId,
      runId,
      reviewerId: c.var.user.id,
      category: caseRow.category,
      geography: caseRow.geography,
    });

    let result;
    try {
      result = await run.resume({
        step: "awaitReviewerAction",
        resumeData: { ...body, reviewer_id: c.var.user.id },
        requestContext,
      });
    } catch (error) {
      await revertClaim(db, caseId, runId);
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[action] resume failed (case=${caseId} run=${runId}): ${reason}`);
      return c.json(errorBody("workflow_failed"), 500);
    }

    const response = buildResponse(result.status, await loadLatestBrief(db, caseId), body);
    await cacheActionResponse(c.env.KV, c.var.user.id, caseId, body.action_id, response);
    return c.json(response);
  },
);

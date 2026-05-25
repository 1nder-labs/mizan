/**
 * Reviewer action route — resumes a suspended workflow run.
 */
import { zValidator } from "@hono/zod-validator";
import { createBriefRun } from "@mizan/mastra";
import { briefs, cases, desc, eq, makeDb, transitionCase, type Db } from "@mizan/db";
import {
  ReviewerActionRequestSchema,
  ReviewerActionResponseSchema,
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
  status: string,
  brief: BriefPayload | null,
  body: ReviewerActionRequest,
): ReviewerActionResponse {
  return ReviewerActionResponseSchema.parse({ status, brief, action: body });
}

export const actionRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: RoleVariables;
}>().post(
  "/:id/action",
  zValidator("param", ParamIdSchema),
  actionIdempotency,
  zValidator("json", ReviewerActionRequestSchema),
  async (c) => {
    const { id: caseId } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = makeDb(c.env.DB);

    const caseRow = await db.select().from(cases).where(eq(cases.id, caseId)).get();
    if (!caseRow) return c.json({ error: "not_found" }, 404);
    if (!caseRow.current_run_id) return c.json({ error: "no_run" }, 409);

    const claimed = await transitionCase(db, {
      caseId,
      runId: caseRow.current_run_id,
      from: "SUSPENDED_HITL",
      to: "RUNNING",
    });
    if (!claimed) return c.json({ error: "not_suspended_or_claimed" }, 409);

    const { run, requestContext } = await createBriefRun(c.env, {
      caseId,
      runId: caseRow.current_run_id,
      reviewerId: c.var.user.id,
      category: caseRow.category,
      geography: caseRow.geography,
    });

    const result = await run.resume({
      step: "awaitReviewerAction",
      resumeData: { ...body, reviewer_id: c.var.user.id },
      requestContext,
    });

    const response = buildResponse(result.status, await loadLatestBrief(db, caseId), body);
    await cacheActionResponse(c.env.KV, c.var.user.id, caseId, body.action_id, response);
    return c.json(response);
  },
);

import { cases, eq, inArray, makeDb, and } from "@mizan/db";
import type { Case } from "@mizan/db";
import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../env.ts";
import type { RoleVariables } from "./require-role.ts";

const RUNNING_STATUSES = ["QUEUED", "RUNNING"] as const;
/**
 * Statuses that may transition into RUNNING via this guard. FAILED is
 * included so a case left in FAILED by a pre-stream throw in
 * `handleBriefPost` can be retried by the reviewer without a manual DB
 * fix — the failure surfaces to operators via the FAILED row, and the
 * next POST grabs a fresh runId.
 */
const ALLOWED_STATUSES = ["DRAFT", "READY_FOR_REVIEW", "ACTIONED", "FAILED"] as const;

export type ProducerVariables = RoleVariables & {
  runId: string;
  caseRow: Case;
};

function isRunningStatus(status: string): boolean {
  return RUNNING_STATUSES.some((value) => value === status);
}

/**
 * Idempotency Layer 2 — atomic case status transition to RUNNING.
 * Sets c.var.runId + c.var.caseRow on success; 404 / 409 on miss / race.
 */
export const producerGuard = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables;
}>(async (c, next) => {
  const caseId = c.req.param("id");
  if (!caseId) return c.json({ error: "case id required" }, 400);

  const db = makeDb(c.env.DB);
  const [existing] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!existing) return c.json({ error: "case not found" }, 404);
  if (isRunningStatus(existing.status)) {
    return c.json({ error: "case already running", runId: existing.current_run_id }, 409);
  }

  const runId = crypto.randomUUID();
  const updated = await db
    .update(cases)
    .set({ status: "RUNNING", current_run_id: runId, updated_at: new Date() })
    .where(and(eq(cases.id, caseId), inArray(cases.status, [...ALLOWED_STATUSES])))
    .returning();

  if (updated.length === 0) {
    return c.json({ error: "case status race lost" }, 409);
  }

  const row = updated[0];
  if (!row) return c.json({ error: "case status race lost" }, 409);

  c.set("runId", runId);
  c.set("caseRow", row);
  await next();
  return;
});

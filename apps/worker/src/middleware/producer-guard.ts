import { cases, eq, makeDb } from "@mizan/db";
import type { Case } from "@mizan/db";
import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../env.ts";
import { claimProducerCase } from "./producer-guard-helpers.ts";
import type { ViewerVariables } from "./require-role.ts";

/**
 * Source statuses from which a FRESH brief run may be claimed: DRAFT (first
 * brief) and FAILED (retry). Narrow on purpose so `revertQueuedClaim` (which
 * always reverts to DRAFT on a send failure) is provably lossless — a
 * reviewed/terminal status can never be downgraded by an enqueue compensation.
 */
const ALLOWED_SOURCES = ["DRAFT", "FAILED"] as const;

/** Type-guard narrowing a case status to the fresh-run source set. */
function isFreshSource(status: Case["status"]): status is (typeof ALLOWED_SOURCES)[number] {
  const allowed: readonly Case["status"][] = ALLOWED_SOURCES;
  return allowed.includes(status);
}

export type ProducerVariables = ViewerVariables & {
  runId: string;
  caseRow: Case;
  /**
   * True when the POST joined an ALREADY in-flight run (QUEUED/RUNNING) rather
   * than claiming a fresh one — the route then subscribes to that run's stream
   * and must NOT re-enqueue.
   */
  replay: boolean;
};

/**
 * Brief producer guard (Idempotency Layer 2) — one durable path, no Mode-A/B
 * split. Atomically resolves a `POST /:id/brief` to one of:
 *   - DRAFT / FAILED   → claim QUEUED, mint a fresh `runId`, `replay=false`
 *                        (the route enqueues the run to the consumer).
 *   - QUEUED / RUNNING → already in flight; reuse `current_run_id`,
 *                        `replay=true` (the route subscribes to that run's DO
 *                        stream, no re-enqueue — this is how a reload rejoins).
 *   - anything else    → 409 `invalid_source_status` (the brief is decided;
 *                        the client shows the persisted brief instead).
 * Sets `runId`, `caseRow`, and `replay` on success. 404s a cross-org / missing
 * case without leaking existence.
 */
export const briefProducerGuard = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables;
}>(async (c, next) => {
  const caseId = c.req.param("id");
  if (!caseId) return c.json({ error: "case id required" }, 400);

  const db = makeDb(c.env.DB);
  const [existing] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!existing) return c.json({ error: "case not found" }, 404);
  if (existing.organization_id !== c.var.viewer.organizationId) {
    return c.json({ error: "case not found" }, 404);
  }

  if (existing.status === "QUEUED" || existing.status === "RUNNING") {
    if (!existing.current_run_id)
      return c.json({ error: "case status race lost", current_status: existing.status }, 409);
    c.set("runId", existing.current_run_id);
    c.set("caseRow", existing);
    c.set("replay", true);
    await next();
    return;
  }
  if (!isFreshSource(existing.status)) {
    return c.json({ error: "invalid_source_status", current_status: existing.status }, 409);
  }

  const claim = await claimProducerCase(db, {
    caseId,
    target: "QUEUED",
    fromStatus: existing.status,
    organizationId: existing.organization_id,
    actorUserId: c.var.viewer.userId,
    sources: ALLOWED_SOURCES,
  });
  if (!claim)
    return c.json({ error: "case status race lost", current_status: existing.status }, 409);

  c.set("runId", claim.runId);
  c.set("caseRow", claim.row);
  c.set("replay", false);
  await next();
  return;
});

import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./index.ts";
import { cases } from "./schema.ts";
import type { Case } from "./schemas.ts";

type CaseStatus = Case["status"];

/**
 * Inputs for an atomic case-status transition pinned to a specific run.
 *
 * `from` may be a single status or an array — the UPDATE filters with
 * `IN (...)` so race losers see `updated.length === 0` and the caller
 * can treat that as "row moved on, nothing to do". Every transition is
 * gated by both the `current_run_id` pin and the source-status set, so
 * the state machine is append-only per run: concurrent consumers cannot
 * race past each other, and stale messages cannot regress a row that
 * has already advanced under a different runId.
 */
export interface CaseTransitionInput {
  readonly caseId: string;
  readonly runId: string;
  readonly from: CaseStatus | readonly CaseStatus[];
  readonly to: CaseStatus;
}

/**
 * Canonical case-status transition for runId-pinned consumer / route
 * compensations. Returns the updated row when the transition matched,
 * or `undefined` when the row was already past the source set (race
 * lost or stale message). Callers narrow on the return value rather
 * than re-querying.
 *
 * Producer enqueue (`producerGuard`) is intentionally NOT routed
 * through this helper — it mints a fresh runId rather than matching
 * on an existing one, which is a structurally different operation.
 *
 * Tenant isolation: the WHERE is pinned on `(id, current_run_id, status)`
 * and deliberately omits `organization_id`. A `current_run_id` is a
 * server-minted UUID that is never exposed across orgs, and EVERY caller
 * already pins the org on the surface that produced the `(caseId, runId)`
 * pair before reaching here:
 *   - route mutations (`actions.ts`, `cases.ts`) act on a runId minted by
 *     an org-scoped `producerGuard` claim (`claimCaseQueued` filters
 *     `organization_id`) or read from an org-scoped case load;
 *   - queue/DLQ consumers act on a server-produced message, not caller input;
 *   - workflow steps act on their own run's caseId.
 * Adding `organization_id` here would be tautological for the consumer
 * paths (org is derived from the case row, so the filter always matches)
 * and redundant for the route paths (already org-scoped upstream). The
 * invariant callers MUST uphold: never pass a `(caseId, runId)` pair that
 * was not first verified to belong to the acting org.
 */
export async function transitionCase(
  db: Db,
  input: CaseTransitionInput,
): Promise<Case | undefined> {
  const sources = Array.isArray(input.from) ? [...input.from] : [input.from];
  const updated = await db
    .update(cases)
    .set({ status: input.to, updated_at: new Date() })
    .where(
      and(
        eq(cases.id, input.caseId),
        eq(cases.current_run_id, input.runId),
        inArray(cases.status, sources),
      ),
    )
    .returning();
  return updated[0];
}

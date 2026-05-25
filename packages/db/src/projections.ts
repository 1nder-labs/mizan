/**
 * Shared Drizzle column projections for the cases table public surface.
 *
 * Both the queue-list and case-detail handlers select the same set of
 * public columns. A single map here eliminates the possibility of the
 * two handlers drifting — if a column is added to `CaseRowSchema` it
 * must also appear here, and both handlers pick it up automatically.
 *
 * Internal columns (`current_run_id`, `brief_partial_json`, `created_by`)
 * are intentionally omitted so they never leak into the HTTP response.
 */

import { cases } from "./schema.ts";

/**
 * Returns the explicit Drizzle column selection map for all public case
 * fields. Pass the result directly into `db.select({ ...caseListProjection() })`.
 */
export function caseListProjection() {
  return {
    id: cases.id,
    status: cases.status,
    category: cases.category,
    geography: cases.geography,
    claimed_zakat_category: cases.claimed_zakat_category,
    created_at: cases.created_at,
    updated_at: cases.updated_at,
  } as const;
}

/**
 * Canonical correlated subqueries for the latest reviewer action on a case row,
 * shared by the reviewer queue projection and the client campaign-list
 * projection so the correlation is written one way, once.
 *
 * The outer `cases.id` correlation MUST be a LITERAL qualified identifier.
 * Interpolating `${cases.id}` renders unqualified (`"id"`) inside a SELECT-list
 * subquery; `"id"` then binds to `reviewer_actions.id` (that column exists too)
 * instead of the outer case, so the projection silently returns null even though
 * the same expression resolves correctly in a WHERE clause. Both callers select
 * from `cases`, so the literal `cases.id` is unambiguous.
 */
import { sql, type SQL } from "drizzle-orm";
import type { ReviewerAction } from "@mizan/shared";

/** The action of the most recent reviewer action on the row's case, or null. */
export function latestActionSql(): SQL<ReviewerAction | null> {
  return sql<ReviewerAction | null>`(
    SELECT action FROM reviewer_actions
    WHERE reviewer_actions.case_id = cases.id
    ORDER BY acted_at DESC LIMIT 1
  )`;
}

/** The epoch-ms timestamp of that most recent reviewer action, or null. */
export function latestActedAtSql(): SQL<number | null> {
  return sql<number | null>`(
    SELECT acted_at FROM reviewer_actions
    WHERE reviewer_actions.case_id = cases.id
    ORDER BY acted_at DESC LIMIT 1
  )`;
}

/**
 * SQL twins of the `submitted`/`client-submitted` triage predicates. Kept in a
 * dependency-free leaf so both the queue WHERE builder (`queue-filters.ts`) and
 * the outcome-disposition filter (`queue-disposition.ts`) share one definition
 * without an import cycle — the SQL counterpart of `isSubmittedForReview`.
 */
import { sql } from "drizzle-orm";
import { cases as casesTable, members } from "@mizan/db";

/**
 * SQL expression returning 1 when the case creator is a `client` member of the
 * org, else 0. Used as a queue triage signal without exposing `created_by`.
 */
export function clientSubmittedExpr() {
  return sql<number>`(CASE WHEN (SELECT ${members.role} FROM ${members} WHERE ${members.userId} = ${casesTable.created_by} AND ${members.organizationId} = ${casesTable.organization_id}) = 'client' THEN 1 ELSE 0 END)`;
}

/**
 * SQL twin of `isSubmittedForReview`: true once a campaign has entered review —
 * a reviewer-seeded case (creator is not a client) or a client draft that has
 * been submitted (`submitted_at` set). The De-Morgan inverse, `NOT submittedSql`,
 * is the unsubmitted-client-draft set the queue list excludes.
 */
export function submittedSql() {
  return sql`(${clientSubmittedExpr()} != 1 OR ${casesTable.submitted_at} IS NOT NULL)`;
}

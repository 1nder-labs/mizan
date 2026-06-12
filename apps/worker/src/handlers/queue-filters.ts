/**
 * WHERE-clause builders for the reviewer queue list: RBAC scoping, the
 * client-submitted triage flag, and the user-facing status / title / category /
 * geography / outcome / archived filters. Kept apart from the read handlers so
 * the query-shaping logic lives in one place.
 */
import { and, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { cases as casesTable } from "@mizan/db";
import type { QueueSearch, ViewerContext } from "@mizan/shared";
import { submittedSql } from "./case-submitted-sql.ts";
import { buildOutcomeFilter } from "./queue-disposition.ts";

/**
 * RBAC scope for the queue list. A reviewer is HARD-scoped to cases assigned to
 * them — the assignee query param is ignored and unassigned cases are excluded
 * (only admins triage unassigned work). Admins keep the flexible filter
 * (default "all"; can narrow to me / unassigned / a specific reviewer).
 */
function resolveAssigneeFilter(search: QueueSearch, viewer: ViewerContext): SQL | undefined {
  if (viewer.role !== "admin") {
    return eq(casesTable.assigned_to, viewer.userId);
  }
  const effective = search.assignee ?? "all";
  if (effective === "all") return undefined;
  if (effective === "unassigned") return isNull(casesTable.assigned_to);
  if (effective === "me") {
    return or(eq(casesTable.assigned_to, viewer.userId), isNull(casesTable.assigned_to));
  }
  return eq(casesTable.assigned_to, effective);
}

/**
 * Per-case RBAC predicate for single-case reads (detail, title resolution) so
 * the Mastra chat tools — which bypass the HTTP `requireCaseAccess` middleware —
 * enforce the same boundary: a reviewer only resolves cases assigned to them;
 * an admin resolves any case in the org. `undefined` for admin so `and(...)`
 * drops it.
 */
export function reviewerAssigneeFilter(viewer: ViewerContext): SQL | undefined {
  return viewer.role === "admin" ? undefined : eq(casesTable.assigned_to, viewer.userId);
}

/**
 * Escapes the LIKE metacharacters (`%`, `_`, `\`) in a user-supplied term so a
 * title filter matches the term literally rather than as a wildcard pattern.
 * Paired with `ESCAPE '\'` on the LIKE clause.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Case-insensitive substring match on `cases.title`. SQLite's LIKE is
 * case-insensitive for ASCII, which covers the campaign titles in use.
 */
function titleLikeFilter(term: string): SQL {
  return sql`${casesTable.title} LIKE ${`%${escapeLike(term)}%`} ESCAPE '\\'`;
}

/** Combines RBAC scope + every active queue filter into one WHERE clause. */
export function buildFilters(search: QueueSearch, viewer: ViewerContext): SQL {
  const filters: SQL[] = [eq(casesTable.organization_id, viewer.organizationId)];
  filters.push(submittedSql());
  if (search.status) filters.push(eq(casesTable.status, search.status));
  if (search.title) filters.push(titleLikeFilter(search.title));
  if (search.category) filters.push(sql`LOWER(${casesTable.category}) = LOWER(${search.category})`);
  if (search.geography)
    filters.push(sql`LOWER(${casesTable.geography}) = LOWER(${search.geography})`);
  if (search.outcome) filters.push(...buildOutcomeFilter(search.outcome));
  filters.push(
    search.archived ? isNotNull(casesTable.archived_at) : isNull(casesTable.archived_at),
  );
  const assignee = resolveAssigneeFilter(search, viewer);
  if (assignee) filters.push(assignee);
  return and(...filters) ?? eq(casesTable.organization_id, viewer.organizationId);
}

/**
 * Read helpers for signals, policy, team, and audit surfaces.
 */
import { and, desc, eq } from "drizzle-orm";
import { fetchAuditPage, member, signals as signalsTable, users, type Db } from "@mizan/db";
import { getClauseById } from "@mizan/mastra";
import type { AuditListSearch, PolicyClauseSource, ViewerContext } from "@mizan/shared";
import { NotFoundError } from "./cases-handler.ts";

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

function pickLatestPerType<T extends { readonly signal_type: string; readonly recorded_at: Date }>(
  rows: T[],
): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    if (!seen.has(row.signal_type)) seen.set(row.signal_type, row);
  }
  return [...seen.values()];
}

/** Lists latest signal rows for one org-scoped case. */
export async function listSignalsForCase(caseId: string, viewer: ViewerContext, db: Db) {
  const rows = await db
    .select({
      signal_type: signalsTable.signal_type,
      payload_json: signalsTable.payload_json,
      recorded_at: signalsTable.recorded_at,
      run_id: signalsTable.run_id,
    })
    .from(signalsTable)
    .where(
      and(
        eq(signalsTable.case_id, caseId),
        eq(signalsTable.organization_id, viewer.organizationId),
      ),
    )
    .orderBy(desc(signalsTable.recorded_at))
    .all();
  return pickLatestPerType(rows).map((row) => ({
    signal_type: row.signal_type,
    payload_json: row.payload_json,
    recorded_at: row.recorded_at.getTime(),
    run_id: row.run_id,
  }));
}

/** Looks up one bundled policy clause by id. */
export function getPolicyClause(clauseId: string, source: PolicyClauseSource) {
  const clause = getClauseById(source, clauseId);
  if (!clause) throw new NotFoundError(`policy clause not found: ${clauseId}`);
  return {
    clauseId: clause.clauseId,
    source: clause.source,
    title: clause.title,
    body: clause.body,
    corpusVersion: clause.corpusVersion,
  };
}

/** Lists members of the viewer's active organization. */
export async function listTeamMembers(viewer: ViewerContext, db: Db) {
  const rows = await db
    .select({
      userId: member.userId,
      email: users.email,
      name: users.name,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(eq(member.organizationId, viewer.organizationId))
    .orderBy(desc(member.createdAt))
    .all();
  return rows.map((row) => ({
    id: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt.getTime(),
  }));
}

/** Admin-only paginated audit feed scoped to the viewer's organization. */
export async function listAuditPage(query: AuditListSearch, viewer: ViewerContext, db: Db) {
  if (viewer.role !== "admin") {
    throw new ForbiddenError("audit list requires admin role");
  }
  return fetchAuditPage(db, query, viewer.organizationId);
}

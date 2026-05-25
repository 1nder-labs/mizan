/**
 * Paginated audit feed query helper for `/api/admin/audit`.
 */
import { count, desc, eq } from "drizzle-orm";
import type { AuditListSearch } from "@mizan/shared";
import type { Db } from "./index.ts";
import { users } from "./auth.schema.ts";
import { cases, reviewer_actions } from "./schema.ts";

const RATIONALE_MAX = 280;

export interface AuditRow {
  readonly id: string;
  readonly case_id: string;
  readonly case_status: string;
  readonly case_category: string;
  readonly reviewer_email: string | null;
  readonly action: string;
  readonly rationale: string;
  readonly acted_at: Date;
}

function truncateRationale(value: string): string {
  if (value.length <= RATIONALE_MAX) return value;
  return `${value.slice(0, RATIONALE_MAX - 1)}…`;
}

/**
 * Fetches one page of reviewer actions joined with case + reviewer metadata.
 */
export async function fetchAuditPage(
  db: Db,
  search: AuditListSearch,
): Promise<{ entries: AuditRow[]; total: number }> {
  const offset = (search.page - 1) * search.page_size;
  const rows = await db
    .select({
      id: reviewer_actions.id,
      case_id: reviewer_actions.case_id,
      case_status: cases.status,
      case_category: cases.category,
      reviewer_email: users.email,
      action: reviewer_actions.action,
      rationale: reviewer_actions.rationale,
      acted_at: reviewer_actions.acted_at,
    })
    .from(reviewer_actions)
    .innerJoin(cases, eq(cases.id, reviewer_actions.case_id))
    .leftJoin(users, eq(users.id, reviewer_actions.reviewer_id))
    .orderBy(desc(reviewer_actions.acted_at), desc(reviewer_actions.id))
    .limit(search.page_size)
    .offset(offset);

  const totalRow = await db.select({ value: count() }).from(reviewer_actions).get();
  const total = totalRow?.value ?? 0;

  return {
    entries: rows.map((row) => ({
      ...row,
      rationale: truncateRationale(row.rationale),
    })),
    total,
  };
}

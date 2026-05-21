import { cases, eq, makeDb } from "@mizan/db";
import type { Case } from "@mizan/db";
import type { CloudflareBindings } from "@mizan/worker/env";
import { CaseOverlaySchema, type CaseOverlay } from "../schemas/case-overlay.ts";

export type CaseRow = Case;

export type CaseContext = CaseRow & CaseOverlay;

/** Loads the D1 case row. */
export async function loadCaseRow(env: CloudflareBindings, caseId: string): Promise<CaseRow> {
  const db = makeDb(env.DB);
  const [row] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!row) throw new Error(`case ${caseId} not found`);
  return row;
}

/** Loads D1 row plus seed overlay stored in brief_partial_json. */
export async function loadCaseContext(
  env: CloudflareBindings,
  caseId: string,
): Promise<CaseContext> {
  const row = await loadCaseRow(env, caseId);
  const overlay = CaseOverlaySchema.parse(row.brief_partial_json);
  return { ...row, ...overlay };
}

export { CaseOverlaySchema };

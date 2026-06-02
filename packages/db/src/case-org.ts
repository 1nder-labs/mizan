/**
 * Resolves the owning organization for a case row.
 */
import { eq } from "drizzle-orm";
import { cases } from "./schema.ts";
import type { Db } from "./index.ts";

/** Loads `cases.organization_id` or throws when the case row is missing. */
export async function resolveCaseOrganizationId(db: Db, caseId: string): Promise<string> {
  const row = await db
    .select({ organization_id: cases.organization_id })
    .from(cases)
    .where(eq(cases.id, caseId))
    .get();
  if (!row) {
    throw new Error(`resolveCaseOrganizationId: case not found (${caseId})`);
  }
  return row.organization_id;
}

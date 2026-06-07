import { and, eq, isNull } from "drizzle-orm";
import { caseNotes, cases, documents, listCaseDocuments, type Db } from "@mizan/db";
import type { ViewerContext } from "@mizan/shared";
import type { CloudflareBindings } from "../../env.ts";

/**
 * Sweeps every uploaded object (all kinds, all versions) for the case from R2
 * (best-effort). A leaked object is harmless next to a surviving case row, so
 * the caller deletes D1 first; failures here are logged, not fatal.
 */
async function sweepEvidence(
  env: CloudflareBindings,
  keys: readonly string[],
  caseId: string,
): Promise<void> {
  const results = await Promise.allSettled(keys.map((key) => env.R2_BUCKET.delete(key)));
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`[portal] draft R2 sweep failed (case=${caseId}): ${String(result.reason)}`);
    }
  }
}

/**
 * Hard-deletes an unsubmitted client draft + its dependents. `case_notes` and
 * `documents` are `onDelete: 'restrict' | 'cascade'` children, but D1 does not
 * enforce FK cascades unless `PRAGMA foreign_keys` is on, so both are removed
 * explicitly in the same atomic `db.batch()` as the case. The R2 keys are read
 * BEFORE the batch (the `documents` rows are about to vanish) and swept after.
 * The caller has already verified ownership + `submitted_at IS NULL`, which also
 * guarantees no briefs / signals / reviewer actions / workflow events reference
 * this case.
 */
export async function deleteDraftCampaign(
  env: CloudflareBindings,
  db: Db,
  viewer: ViewerContext,
  caseId: string,
): Promise<void> {
  const docs = await listCaseDocuments(db, caseId, viewer.organizationId);
  await db.batch([
    db
      .delete(caseNotes)
      .where(
        and(eq(caseNotes.case_id, caseId), eq(caseNotes.organization_id, viewer.organizationId)),
      ),
    db
      .delete(documents)
      .where(
        and(eq(documents.case_id, caseId), eq(documents.organization_id, viewer.organizationId)),
      ),
    db
      .delete(cases)
      .where(
        and(eq(cases.id, caseId), eq(cases.created_by, viewer.userId), isNull(cases.submitted_at)),
      ),
  ]);
  await sweepEvidence(
    env,
    docs.map((doc) => doc.r2_key),
    caseId,
  );
}

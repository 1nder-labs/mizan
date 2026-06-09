import { and, eq, isNull, sql } from "drizzle-orm";
import { caseNotes, cases, documents, listCaseDocuments, type Db } from "@mizan/db";
import type { ViewerContext } from "@mizan/shared";
/**
 * The R2 capability `sweepEvidence` needs — just the object delete. Kept minimal
 * (not the full `CloudflareBindings`) so both the route's real bindings and the
 * integration test's generated `Env` satisfy it without their `R2Bucket.get`
 * type-skew mattering: `deleteDraftCampaign` never reads objects, only deletes.
 */
interface EvidenceR2 {
  readonly R2_BUCKET: { delete(key: string): Promise<void> };
}

/**
 * Sweeps every uploaded object (all kinds, all versions) for the case from R2
 * (best-effort). A leaked object is harmless next to a surviving case row, so
 * the caller deletes D1 first; failures here are logged, not fatal.
 */
async function sweepEvidence(
  env: EvidenceR2,
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
 * this case. To close the window between that check and this batch, every child
 * delete carries the SAME `EXISTS(unsubmitted owned case)` guard as the case
 * delete: if a concurrent submit flips `submitted_at` first, all three deletes
 * match zero rows together (the campaign survives intact) rather than the case
 * delete no-op'ing while notes + documents are orphaned away. The case delete
 * `RETURNING`s its id; when it matched nothing (the raced-submit case) the R2
 * sweep is skipped too, so a now-submitted campaign keeps its objects rather
 * than its surviving `documents` rows pointing at deleted keys.
 */
export async function deleteDraftCampaign(
  env: EvidenceR2,
  db: Db,
  viewer: ViewerContext,
  caseId: string,
): Promise<void> {
  const docs = await listCaseDocuments(db, caseId, viewer.organizationId);
  const ownedDraft = sql`EXISTS (SELECT 1 FROM ${cases} WHERE ${cases.id} = ${caseId} AND ${cases.created_by} = ${viewer.userId} AND ${cases.submitted_at} IS NULL)`;
  const [, , deletedCases] = await db.batch([
    db
      .delete(caseNotes)
      .where(
        and(
          eq(caseNotes.case_id, caseId),
          eq(caseNotes.organization_id, viewer.organizationId),
          ownedDraft,
        ),
      ),
    db
      .delete(documents)
      .where(
        and(
          eq(documents.case_id, caseId),
          eq(documents.organization_id, viewer.organizationId),
          ownedDraft,
        ),
      ),
    db
      .delete(cases)
      .where(
        and(eq(cases.id, caseId), eq(cases.created_by, viewer.userId), isNull(cases.submitted_at)),
      )
      .returning({ id: cases.id }),
  ]);
  if (deletedCases.length === 0) return;
  await sweepEvidence(
    env,
    docs.map((doc) => doc.r2_key),
    caseId,
  );
}

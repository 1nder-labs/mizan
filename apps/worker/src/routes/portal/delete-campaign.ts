import { and, eq, isNull } from "drizzle-orm";
import { caseNotes, cases, type Db } from "@mizan/db";
import { DocumentKeyEnum, type ViewerContext } from "@mizan/shared";
import type { CloudflareBindings } from "../../env.ts";
import { evidenceKey } from "./evidence-upload.ts";

/**
 * Sweeps the three evidence objects from R2 (best-effort). A leaked object is
 * harmless next to a surviving case row pointing at a deleted doc, so the caller
 * deletes D1 first; failures here are logged, not fatal.
 */
async function sweepEvidence(env: CloudflareBindings, caseId: string): Promise<void> {
  const results = await Promise.allSettled(
    DocumentKeyEnum.options.map((docKind) => env.R2_BUCKET.delete(evidenceKey(caseId, docKind))),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`[portal] draft R2 sweep failed (case=${caseId}): ${String(result.reason)}`);
    }
  }
}

/**
 * Hard-deletes an unsubmitted client draft + its dependents. `case_notes` is an
 * `onDelete: 'restrict'` child (an evidence upload attaches one) and D1 does not
 * enforce FK cascades unless `PRAGMA foreign_keys` is on, so its rows are removed
 * explicitly in the same atomic `db.batch()` as the case. The caller has already
 * verified ownership + `submitted_at IS NULL`, which also guarantees no briefs /
 * signals / reviewer actions / workflow events reference this case.
 */
export async function deleteDraftCampaign(
  env: CloudflareBindings,
  db: Db,
  viewer: ViewerContext,
  caseId: string,
): Promise<void> {
  await db.batch([
    db
      .delete(caseNotes)
      .where(
        and(eq(caseNotes.case_id, caseId), eq(caseNotes.organization_id, viewer.organizationId)),
      ),
    db
      .delete(cases)
      .where(
        and(eq(cases.id, caseId), eq(cases.created_by, viewer.userId), isNull(cases.submitted_at)),
      ),
  ]);
  await sweepEvidence(env, caseId);
}

import { briefs, eq, makeDb, and } from "@mizan/db";
import type { CloudflareBindings } from "@mizan/worker/env";
import type { BriefPayload } from "@mizan/shared";

/**
 * Updates an existing brief row after a post-composeBrief mutation
 * (forced-escalate override or organizer-message draft).
 *
 * Throws if the row does not exist. A silent no-op would let an in-memory
 * `BriefPayload` mutation diverge from the persisted row, so the reviewer
 * would see the pre-mutation recommendation while the worker thought it had
 * been overridden.
 */
export async function updatePersistedBrief(input: {
  env: CloudflareBindings;
  caseId: string;
  runId: string;
  brief: BriefPayload;
}): Promise<void> {
  const db = makeDb(input.env.DB);
  const rows = await db
    .update(briefs)
    .set({
      recommendation: input.brief.recommendation,
      confidence: input.brief.confidence,
      payload_json: input.brief,
    })
    .where(and(eq(briefs.case_id, input.caseId), eq(briefs.run_id, input.runId)))
    .returning({ id: briefs.id });
  if (rows.length === 0) {
    throw new Error(
      `updatePersistedBrief: no row matched (case_id=${input.caseId}, run_id=${input.runId})`,
    );
  }
}

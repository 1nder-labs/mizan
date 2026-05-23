import { briefs, eq, makeDb, and } from "@mizan/db";
import type { CloudflareBindings } from "@mizan/shared";
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
  env: Pick<CloudflareBindings, "DB">;
  caseId: string;
  runId: string;
  brief: BriefPayload;
}): Promise<void> {
  const db = makeDb(input.env.DB);
  let rows: ReadonlyArray<{ id: string }>;
  try {
    rows = await db
      .update(briefs)
      .set({
        recommendation: input.brief.recommendation,
        confidence: input.brief.confidence,
        payload_json: input.brief,
      })
      .where(and(eq(briefs.case_id, input.caseId), eq(briefs.run_id, input.runId)))
      .returning({ id: briefs.id });
  } catch (cause) {
    throw new Error(
      `updatePersistedBrief failed (case_id=${input.caseId} run_id=${input.runId}): ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
  if (rows.length === 0) {
    throw new Error(
      `updatePersistedBrief failed (case_id=${input.caseId} run_id=${input.runId}): no row matched`,
    );
  }
}

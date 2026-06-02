import type { MessageBatch } from "@cloudflare/workers-types";
import {
  batchTransitionWithEmits,
  buildStatusChangedEmits,
  cases,
  eq,
  makeDb,
  type Db,
} from "@mizan/db";
import { BriefQueueMessageSchema } from "@mizan/shared";
import type { CloudflareBindings } from "../env.ts";

const DLQ_FAIL_SOURCES = ["QUEUED", "RUNNING"] as const;

/**
 * Flips a case to FAILED and emits the status change so SSE subscribers see it
 * leave QUEUED/RUNNING (live events are push-only). The case's current status +
 * org are read first so the emit carries an accurate `from_status` and tenant;
 * the emit only fires if the guarded transition actually matched. Returns true
 * when the row moved.
 */
async function failCase(db: Db, caseId: string, runId: string): Promise<boolean> {
  const caseRow = await db
    .select({ status: cases.status, organization_id: cases.organization_id })
    .from(cases)
    .where(eq(cases.id, caseId))
    .get();
  const emits = caseRow
    ? buildStatusChangedEmits({
        caseId,
        organizationId: caseRow.organization_id,
        fromStatus: caseRow.status,
        toStatus: "FAILED",
        actorUserId: null,
      })
    : [];
  const updated = await batchTransitionWithEmits(
    db,
    { caseId, runId, from: [...DLQ_FAIL_SOURCES], to: "FAILED" },
    emits,
  );
  return Boolean(updated);
}

/**
 * DLQ consumer for `mizan-brief-jobs-dlq`. Flips exhausted retries to
 * FAILED so the producer guard can grant a fresh run on the next POST.
 * The atomic transition is guarded by both the `current_run_id` pin and
 * `status IN ('QUEUED','RUNNING')` so a row whose run already advanced
 * (manual reviewer override, concurrent finalisation) is preserved.
 */
export async function handleDlq(
  batch: MessageBatch<unknown>,
  env: CloudflareBindings,
): Promise<void> {
  const db = makeDb(env.DB);

  for (const msg of batch.messages) {
    const parsed = BriefQueueMessageSchema.safeParse(msg.body);
    if (!parsed.success) {
      console.error("dlq poison message", { error: parsed.error.message });
      msg.ack();
      continue;
    }

    const { caseId, runId } = parsed.data;
    const updated = await failCase(db, caseId, runId);

    if (!updated) {
      console.error("dlq case row unchanged", { caseId, runId });
    } else {
      console.warn("brief workflow exhausted retries", { caseId, runId });
    }

    msg.ack();
  }
}

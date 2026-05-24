import type { MessageBatch } from "@cloudflare/workers-types";
import { cases, eq, and, inArray, makeDb } from "@mizan/db";
import { BriefQueueMessageSchema } from "@mizan/shared";
import type { CloudflareBindings } from "../env.ts";

/**
 * DLQ consumer for `mizan-brief-jobs-dlq`. Flips exhausted retries to
 * FAILED so the producer guard can grant a fresh run on the next POST.
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
    const updated = await db
      .update(cases)
      .set({ status: "FAILED", updated_at: new Date() })
      .where(
        and(
          eq(cases.id, caseId),
          eq(cases.current_run_id, runId),
          inArray(cases.status, ["QUEUED", "RUNNING"]),
        ),
      )
      .returning();

    if (updated.length === 0) {
      console.error("dlq case row unchanged", { caseId, runId });
    } else {
      console.warn("brief workflow exhausted retries", { caseId, runId });
    }

    msg.ack();
  }
}

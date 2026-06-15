import type { MessageBatch } from "@cloudflare/workers-types";
import { makeDb } from "@mizan/db";
import { BriefQueueMessageSchema } from "@mizan/shared";
import type { CloudflareBindings } from "../env.ts";
import { finishBriefStream } from "../durable/brief-stream-client.ts";
import { failCaseToFailed } from "../lib/fail-case.ts";

/**
 * DLQ consumer for `mizan-brief-jobs-dlq`. Flips exhausted retries to
 * FAILED so the producer guard can grant a fresh run on the next POST.
 * The atomic transition is guarded by both the `current_run_id` pin and
 * `status IN ('QUEUED','RUNNING')` so a row whose run already advanced
 * (manual reviewer override, concurrent finalisation) is preserved.
 *
 * Terminal: also finish the run's brief-stream DO so any reviewer still
 * subscribed gets a clean close instead of a forever-open stream. The consumer
 * never finishes the DO on a failed attempt (so retries can resume), so the
 * terminal close is owned here — without it a run that throws before relaying
 * any chunk (bad LLM key, Mastra init failure) would hang every subscriber.
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
    const updated = await failCaseToFailed(db, caseId, runId);
    await finishBriefStream(env, runId);

    if (!updated) {
      console.error("dlq case row unchanged", { caseId, runId });
    } else {
      console.warn("brief workflow exhausted retries", { caseId, runId });
    }

    msg.ack();
  }
}

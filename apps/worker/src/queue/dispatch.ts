import type { ExecutionContext, MessageBatch } from "@cloudflare/workers-types";
import type { CloudflareBindings } from "../env.ts";
import { handleBriefQueue } from "./brief-consumer.ts";
import { handleDlq } from "./dlq-consumer.ts";

/**
 * Canonical queue names. Must match `apps/worker/wrangler.jsonc`
 * `queues.producers[].queue` and `queues.consumers[].queue` entries.
 * Exported so tests (and future producers) can reference them without
 * duplicating the string literal.
 */
export const BRIEF_JOBS_QUEUE = "mizan-brief-jobs";
export const BRIEF_JOBS_DLQ = "mizan-brief-jobs-dlq";

/**
 * Routes queue batches to the brief job consumer or the DLQ handler by
 * `batch.queue` name.
 */
export async function dispatchQueue(
  batch: MessageBatch<unknown>,
  env: CloudflareBindings,
  ctx: ExecutionContext,
): Promise<void> {
  switch (batch.queue) {
    case BRIEF_JOBS_QUEUE:
      await handleBriefQueue(batch, env, ctx);
      return;
    case BRIEF_JOBS_DLQ:
      await handleDlq(batch, env);
      return;
    default:
      throw new Error(`unknown queue: ${batch.queue}`);
  }
}

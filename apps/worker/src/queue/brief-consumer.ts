import type { ExecutionContext, MessageBatch } from "@cloudflare/workers-types";
import { createBriefRun, flushLangfuse } from "@mizan/mastra";
import { cases, eq, makeDb, transitionCase, type Db } from "@mizan/db";
import type { Case } from "@mizan/db";
import { BriefQueueMessageSchema, type BriefQueueMessage } from "@mizan/shared";
import type { CloudflareBindings } from "../env.ts";
import { classifyRedelivery } from "./brief-consumer-helpers.ts";

type QueueMessage = MessageBatch<unknown>["messages"][number];

async function loadCase(db: Db, caseId: string): Promise<Case | undefined> {
  const [row] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  return row;
}

/**
 * Atomically transitions a case to RUNNING. Accepted source statuses are
 * narrow on purpose:
 *
 *   - QUEUED   — first delivery from the producer
 *   - RUNNING  — crash recovery, only reached when `msg.attempts > 1`
 *                per `classifyRedelivery`. Combined with the
 *                `current_run_id` guard, this lets a redelivery take
 *                over a claim whose owning consumer crashed before
 *                reverting; Mastra's runId-keyed D1 persistence is the
 *                backstop against double execution against the same run.
 *
 * FAILED is intentionally excluded so a DLQ flip (which keeps the same
 * `current_run_id`) cannot be undone by a stale main-queue message
 * still in flight. A producer retry from FAILED mints a fresh runId via
 * `producerGuard`, which never collides with this WHERE.
 *
 * Returns the claimed row so the caller works against the post-claim
 * snapshot, not the pre-claim one. Race-loser sees `undefined` and acks.
 */
async function claimRun(db: Db, message: BriefQueueMessage): Promise<Case | undefined> {
  return transitionCase(db, {
    caseId: message.caseId,
    runId: message.runId,
    from: ["QUEUED", "RUNNING"],
    to: "RUNNING",
  });
}

async function revertClaim(db: Db, caseId: string, runId: string): Promise<void> {
  await transitionCase(db, {
    caseId,
    runId,
    from: "RUNNING",
    to: "QUEUED",
  });
}

async function runWorkflow(
  env: CloudflareBindings,
  executionCtx: ExecutionContext,
  message: BriefQueueMessage,
  caseRow: Case,
): Promise<void> {
  const { run, requestContext, langfuse } = await createBriefRun(env, {
    caseId: message.caseId,
    runId: message.runId,
    reviewerId: message.requestedBy,
    category: caseRow.category,
    geography: caseRow.geography,
  });
  await run.start({
    inputData: { caseId: message.caseId, runId: message.runId },
    requestContext,
  });
  flushLangfuse(langfuse, executionCtx);
}

/**
 * Runs the workflow for a claimed case and reverts the claim if it fails.
 * On workflow failure, revertClaim is attempted in isolation; if that also
 * throws, the error is logged and `msg.retry()` is still called.
 */
async function executeClaimedRun(
  msg: QueueMessage,
  env: CloudflareBindings,
  db: Db,
  executionCtx: ExecutionContext,
  message: BriefQueueMessage,
  row: Case,
): Promise<void> {
  try {
    await runWorkflow(env, executionCtx, message, row);
    msg.ack();
  } catch (error) {
    try {
      await revertClaim(db, message.caseId, message.runId);
    } catch (revertErr) {
      console.error("brief queue revert claim failed", {
        caseId: message.caseId,
        runId: message.runId,
        msg: revertErr instanceof Error ? revertErr.message : String(revertErr),
      });
    }
    console.error("brief workflow failed", {
      caseId: message.caseId,
      runId: message.runId,
      msg: error instanceof Error ? error.message : String(error),
    });
    msg.retry();
  }
}

async function processMessage(
  msg: QueueMessage,
  env: CloudflareBindings,
  db: Db,
  executionCtx: ExecutionContext,
): Promise<void> {
  const parsed = BriefQueueMessageSchema.safeParse(msg.body);
  if (!parsed.success) {
    console.error("brief queue poison message", { error: parsed.error.message });
    msg.ack();
    return;
  }

  const message = parsed.data;
  const row = await loadCase(db, message.caseId);
  if (!row) {
    console.error("brief queue missing case", { caseId: message.caseId, runId: message.runId });
    msg.ack();
    return;
  }

  const action = classifyRedelivery(row, message.runId, msg.attempts);
  if (action === "retry-running") {
    msg.retry();
    return;
  }
  if (action !== "claim") {
    msg.ack();
    return;
  }

  const claimed = await claimRun(db, message);
  if (!claimed) {
    msg.ack();
    return;
  }

  await executeClaimedRun(msg, env, db, executionCtx, message, claimed);
}

/**
 * Layer 3 idempotent consumer for `mizan-brief-jobs`. Pins the
 * producer-issued runId into Mastra D1 storage and runs `briefWorkflow`
 * to completion via `run.start`.
 */
export async function handleBriefQueue(
  batch: MessageBatch<unknown>,
  env: CloudflareBindings,
  ctx: ExecutionContext,
): Promise<void> {
  const db = makeDb(env.DB);
  for (const msg of batch.messages) {
    try {
      await processMessage(msg, env, db, ctx);
    } catch (error) {
      console.error("brief queue message handler failed", {
        msgId: msg.id,
        attempts: msg.attempts,
        body: msg.body,
        msg: error instanceof Error ? error.message : String(error),
      });
      msg.retry();
    }
  }
}

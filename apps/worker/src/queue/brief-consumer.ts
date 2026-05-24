import type { ExecutionContext, MessageBatch } from "@cloudflare/workers-types";
import { createBriefRun, flushLangfuse } from "@mizan/mastra";
import { cases, eq, and, inArray, makeDb } from "@mizan/db";
import type { Case } from "@mizan/db";
import { BriefQueueMessageSchema, type BriefQueueMessage } from "@mizan/shared";
import type { CloudflareBindings } from "../env.ts";
import { classifyRedelivery } from "./brief-consumer-helpers.ts";

type QueueMessage = MessageBatch<unknown>["messages"][number];

async function loadCase(env: CloudflareBindings, caseId: string): Promise<Case | undefined> {
  const db = makeDb(env.DB);
  const [row] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  return row;
}

/**
 * Atomically transitions a case to RUNNING. Accepted source statuses:
 *   - QUEUED / FAILED → first delivery or producer retry after FAILED
 *   - RUNNING        → crash recovery (only reached when `msg.attempts > 1`
 *                      per `classifyRedelivery`; combined with the
 *                      `current_run_id` guard, this lets a redelivery
 *                      take over a claim whose owning consumer crashed
 *                      before reverting; Mastra's runId-keyed D1
 *                      persistence is the backstop against double
 *                      execution against the same run)
 * Race-loser sees `updated.length === 0` and acks.
 */
async function claimRun(env: CloudflareBindings, caseId: string, runId: string): Promise<boolean> {
  const db = makeDb(env.DB);
  const updated = await db
    .update(cases)
    .set({ status: "RUNNING", updated_at: new Date() })
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.current_run_id, runId),
        inArray(cases.status, ["QUEUED", "FAILED", "RUNNING"]),
      ),
    )
    .returning();
  return updated.length > 0;
}

async function revertClaim(env: CloudflareBindings, caseId: string, runId: string): Promise<void> {
  const db = makeDb(env.DB);
  await db
    .update(cases)
    .set({ status: "QUEUED", updated_at: new Date() })
    .where(and(eq(cases.id, caseId), eq(cases.current_run_id, runId), eq(cases.status, "RUNNING")));
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
  executionCtx: ExecutionContext,
  message: BriefQueueMessage,
  row: Case,
): Promise<void> {
  try {
    await runWorkflow(env, executionCtx, message, row);
    msg.ack();
  } catch (error) {
    try {
      await revertClaim(env, message.caseId, message.runId);
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
  executionCtx: ExecutionContext,
): Promise<void> {
  const parsed = BriefQueueMessageSchema.safeParse(msg.body);
  if (!parsed.success) {
    console.error("brief queue poison message", { error: parsed.error.message });
    msg.ack();
    return;
  }

  const message = parsed.data;
  const row = await loadCase(env, message.caseId);
  if (!row) {
    console.error("brief queue missing case", { caseId: message.caseId, runId: message.runId });
    msg.ack();
    return;
  }

  const action = classifyRedelivery(row, message.runId, msg.attempts);
  if (action !== "claim") {
    msg.ack();
    return;
  }

  const claimed = await claimRun(env, message.caseId, message.runId);
  if (!claimed) {
    msg.ack();
    return;
  }

  await executeClaimedRun(msg, env, executionCtx, message, row);
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
  for (const msg of batch.messages) {
    try {
      await processMessage(msg, env, ctx);
    } catch (error) {
      console.error("brief queue message handler failed", {
        msg: error instanceof Error ? error.message : String(error),
      });
      msg.retry();
    }
  }
}

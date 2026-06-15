import type { DurableObjectStub, ExecutionContext, MessageBatch } from "@cloudflare/workers-types";
import { emitWorkflowEvent } from "@mizan/mastra/runtime";
import {
  batchTransitionWithEmits,
  buildStatusChangedEmits,
  cases,
  eq,
  makeDb,
  resolveCaseOrganizationId,
  transitionCase,
  type Db,
} from "@mizan/db";
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
  const claimed = await transitionCase(db, {
    caseId: message.caseId,
    runId: message.runId,
    from: ["QUEUED", "RUNNING"],
    to: "RUNNING",
  });
  if (claimed) {
    try {
      await emitWorkflowEvent(db, {
        caseId: message.caseId,
        runId: message.runId,
        eventType: "workflow.start",
        payloadMeta: {
          caseId: message.caseId,
          runId: message.runId,
        },
      });
    } catch (error) {
      await revertClaim(db, message.caseId, message.runId);
      throw error;
    }
  }
  return claimed;
}

/**
 * Reverts a failed RUNNING claim back to QUEUED and emits the status change so
 * SSE subscribers see the case re-queue (live events are push-only — a silent
 * revert leaves a board stuck on RUNNING). Org is resolved from the case row
 * because the queue message carries no tenant id; `actorUserId` is null
 * (system-driven retry compensation).
 */
async function revertClaim(db: Db, caseId: string, runId: string): Promise<void> {
  const organizationId = await resolveCaseOrganizationId(db, caseId);
  await batchTransitionWithEmits(
    db,
    { caseId, runId, from: "RUNNING", to: "QUEUED" },
    buildStatusChangedEmits({
      caseId,
      organizationId,
      fromStatus: "RUNNING",
      toStatus: "QUEUED",
      actorUserId: null,
    }),
  );
}

/**
 * Relays the run's SSE stream to the brief-stream DO chunk by chunk as a plain
 * string body — universal across the workers-types/DOM type split, so no RPC
 * generic + no cast — then signals completion. The DO buffers + broadcasts each
 * chunk to connected reviewers. Driving the read here keeps the workflow
 * running in the durable consumer; the DO is only the resumable-stream store.
 */
async function relayToBriefStream(
  stub: DurableObjectStub,
  body: ReadableStream<Uint8Array> | null,
): Promise<void> {
  const publishUrl = "https://brief-stream/?op=publish";
  const finishUrl = "https://brief-stream/?op=finish";
  if (!body) {
    await stub.fetch(finishUrl, { method: "POST" });
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        await stub.fetch(publishUrl, {
          method: "POST",
          body: decoder.decode(value, { stream: true }),
        });
      }
    }
  } finally {
    await stub.fetch(finishUrl, { method: "POST" });
  }
}

async function runWorkflow(
  env: CloudflareBindings,
  executionCtx: ExecutionContext,
  message: BriefQueueMessage,
  caseRow: Case,
): Promise<void> {
  /**
   * Dynamic import keeps the heavy Mastra/AI-SDK graph out of the worker's
   * static boot (see `@mizan/mastra/runtime`'s docstring); the modules are
   * evaluated once per isolate on the first consumed brief.
   */
  const { createBriefRun, flushLangfuse } = await import("@mizan/mastra");
  const { toAISdkStream } = await import("@mastra/ai-sdk");
  const { createUIMessageStream, createUIMessageStreamResponse } = await import("ai");
  const { run, requestContext, langfuse, tracingOptions } = await createBriefRun(env, {
    caseId: message.caseId,
    runId: message.runId,
    reviewerId: message.requestedBy,
    organizationId: caseRow.organization_id,
    category: caseRow.category,
    geography: caseRow.geography,
  });
  try {
    /**
     * Stream the run (not `run.start()`) and PIPE its SSE into the brief-stream
     * DO, which buffers + broadcasts it to any connected reviewer. Awaiting the
     * DO ingest holds this consumer (and the run) open until the workflow
     * completes/suspends — the workflow's own steps persist the brief + flip the
     * case to SUSPENDED_HITL. Execution lives here in the durable consumer; the
     * DO is only the resumable-stream store.
     */
    const workflowStream = run.stream({
      inputData: { caseId: message.caseId, runId: message.runId },
      requestContext,
      tracingOptions,
    });
    const uiStream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.merge(toAISdkStream(workflowStream, { from: "workflow", version: "v6" }));
      },
    });
    const response = createUIMessageStreamResponse({ stream: uiStream });
    const stub = env.BRIEF_STREAM.get(env.BRIEF_STREAM.idFromName(message.runId));
    await relayToBriefStream(stub, response.body);
  } finally {
    flushLangfuse(langfuse, executionCtx);
  }
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
  switch (action) {
    case "ack-mismatch":
    case "ack-terminal":
    case "ack-running":
      msg.ack();
      return;
    case "retry-running":
      msg.retry();
      return;
    case "claim": {
      const claimed = await claimRun(db, message);
      if (!claimed) {
        msg.ack();
        return;
      }
      await executeClaimedRun(msg, env, db, executionCtx, message, claimed);
      return;
    }
    default:
      assertUnreachableAction(action, msg, message);
      return;
  }
}

/**
 * Compile-time guard: adding a sixth `RedeliveryAction` variant
 * without a matching `case` above causes this assertion to fail
 * typecheck — `action` would no longer narrow to `never`. Runtime
 * fallback acks loudly so production never silently drops a
 * message on the unhandled branch.
 */
function assertUnreachableAction(
  action: never,
  msg: QueueMessage,
  message: BriefQueueMessage,
): void {
  console.error("brief queue unhandled redelivery action", {
    action,
    caseId: message.caseId,
    runId: message.runId,
  });
  msg.ack();
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

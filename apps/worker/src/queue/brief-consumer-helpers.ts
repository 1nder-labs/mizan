import type { Case } from "@mizan/db";

export type RedeliveryAction = "ack-mismatch" | "ack-terminal" | "ack-running" | "claim";

/**
 * Classification for queue redelivery — decides whether to ack without
 * work or proceed to an atomic claim. Caller owns all side-effects
 * (ack/retry).
 *
 * RUNNING handling is gated by `attempts`:
 *   - `attempts === 1` — concurrent duplicate delivery while the
 *      in-flight consumer is still running; defer to that consumer
 *      and ack this message (Mastra D1 persistence is the gate).
 *   - `attempts > 1` — redelivery after the prior consumer crashed
 *      before reverting its claim; reclaim and resume. The atomic
 *      `claimRun` UPDATE plus `current_run_id` guard is the
 *      mutual-exclusion gate, and Mastra's runId-keyed persistence
 *      makes resuming an already-started run idempotent.
 *
 * SUSPENDED_HITL is treated as terminal-for-this-consumer: the
 * workflow paused itself awaiting reviewer action; the next move comes
 * from `POST /api/cases/:id/action` (Phase 7), not from the queue.
 *
 * Unhandled enum values fall through to an `assertNever` so any future
 * status-enum addition surfaces as a compile error rather than a silent
 * ack.
 */
export function classifyRedelivery(row: Case, runId: string, attempts: number): RedeliveryAction {
  if (row.current_run_id !== runId) return "ack-mismatch";
  switch (row.status) {
    case "READY_FOR_REVIEW":
    case "ACTIONED":
    case "SUSPENDED_HITL":
      return "ack-terminal";
    case "RUNNING":
      return attempts > 1 ? "claim" : "ack-running";
    case "QUEUED":
    case "FAILED":
      return "claim";
    case "DRAFT": {
      console.error("brief queue orphaned DRAFT row", { caseId: row.id, runId });
      return "ack-mismatch";
    }
    default:
      return assertNever(row.status, { caseId: row.id, runId });
  }
}

function assertNever(
  status: never,
  ctx: { readonly caseId: string; readonly runId: string },
): RedeliveryAction {
  console.error("brief queue unexpected case status", { ...ctx, status });
  return "ack-mismatch";
}

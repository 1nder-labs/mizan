import type { Case } from "@mizan/db";

export type RedeliveryAction =
  | "ack-mismatch"
  | "ack-terminal"
  | "ack-running"
  | "retry-running"
  | "claim";

/**
 * Stale-claim threshold for crash-recovery on RUNNING rows. Cloudflare
 * Workers cap wall-time at 5 minutes on the paid plan; a row that has
 * not had `updated_at` bumped by a `transitionCase` call for longer
 * than this threshold has lost its owning consumer and can be
 * reclaimed by a redelivery. Margin over the 5-min cap covers clock
 * skew + last-step persistence latency.
 *
 * Important: `updated_at` is bumped on every `transitionCase` call —
 * claim, revert, set, DLQ flip — but NOT on `upsertSignal` or brief
 * inserts during workflow execution. The case row is effectively
 * frozen at claim timestamp for the duration of the run; the staleness
 * gate is therefore measuring "time since claim", not "time since the
 * consumer last did work". For Phase 4's measured ~60s e2e brief
 * runtime this gives a comfortable margin, but combined with the
 * retry-loop fallback below, a crash mid-run does not have to wait
 * the full staleness window before recovery starts.
 */
export const RUNNING_STALE_THRESHOLD_MS = 10 * 60 * 1000;

export interface ClassifyTimeInputs {
  readonly now?: number;
  readonly staleThresholdMs?: number;
}

/**
 * Classification for queue redelivery — decides whether to ack, retry,
 * or proceed to an atomic claim. The caller owns all side-effects.
 *
 * RUNNING fan-out by `attempts` and row staleness:
 *
 *   - `attempts === 1` (any age) → `ack-running`
 *     Concurrent duplicate from the first delivery batch; defer to
 *     the in-flight consumer.
 *
 *   - `attempts > 1` AND fresh row → `retry-running`
 *     Redelivery while the row still looks alive. Cannot reclaim
 *     (double-exec risk against a still-live consumer) and MUST NOT
 *     ack (would orphan the row if the prior consumer actually
 *     crashed). Asking the queue to retry preserves both invariants:
 *     either the consumer recovers and the row transitions naturally,
 *     or the row stales past `RUNNING_STALE_THRESHOLD_MS` and a later
 *     redelivery flips to `claim`, or `max_retries` is reached and
 *     the message hits the DLQ → DLQ consumer flips to FAILED →
 *     producer mints a fresh runId on retry.
 *
 *   - `attempts > 1` AND stale row → `claim`
 *     Crash recovery proven: the row hasn't had a transition for
 *     longer than `RUNNING_STALE_THRESHOLD_MS`, so the prior consumer
 *     can no longer be alive (well past the 5-min Worker wall-time
 *     cap). The atomic `claimRun` UPDATE plus `current_run_id` guard
 *     is the mutex; Mastra's runId-keyed D1 persistence is the
 *     double-execution backstop against the same run.
 *
 * SUSPENDED_HITL / READY_FOR_REVIEW / ACTIONED / FAILED are terminal
 * for this consumer (FAILED is terminal for this runId — the DLQ
 * flipped it; producer retry mints a fresh runId).
 *
 * DRAFT is structurally orphan (producer-guard always mints QUEUED
 * before send). Log + ack.
 *
 * Unhandled enum values fall through to `assertNever` so any future
 * status-enum addition surfaces as a compile error rather than a
 * silent ack.
 */
export function classifyRedelivery(
  row: Case,
  runId: string,
  attempts: number,
  time?: ClassifyTimeInputs,
): RedeliveryAction {
  if (row.current_run_id !== runId) return "ack-mismatch";
  switch (row.status) {
    case "READY_FOR_REVIEW":
    case "ACTIONED":
    case "SUSPENDED_HITL":
    case "FAILED":
      return "ack-terminal";
    case "RUNNING":
      if (attempts === 1) return "ack-running";
      return isStaleClaim(row, time) ? "claim" : "retry-running";
    case "QUEUED":
      return "claim";
    case "DRAFT": {
      console.error("brief queue orphaned DRAFT row", { caseId: row.id, runId });
      return "ack-mismatch";
    }
    default:
      return assertNever(row.status, { caseId: row.id, runId });
  }
}

function isStaleClaim(row: Case, time: ClassifyTimeInputs | undefined): boolean {
  const now = time?.now ?? Date.now();
  const threshold = time?.staleThresholdMs ?? RUNNING_STALE_THRESHOLD_MS;
  const age = now - row.updated_at.getTime();
  return age > threshold;
}

function assertNever(
  status: never,
  ctx: { readonly caseId: string; readonly runId: string },
): RedeliveryAction {
  console.error("brief queue unexpected case status", { ...ctx, status });
  return "ack-mismatch";
}

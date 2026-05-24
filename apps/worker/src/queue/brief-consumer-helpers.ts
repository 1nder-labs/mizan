import type { Case } from "@mizan/db";

export type RedeliveryAction = "ack-mismatch" | "ack-terminal" | "ack-running" | "claim";

/**
 * Stale-claim threshold for crash-recovery on RUNNING rows. Cloudflare
 * Workers cap wall-time at 5 minutes on the paid plan; a row that has
 * not had `updated_at` change for longer than this threshold has lost
 * its owning consumer and can be reclaimed by a redelivery. Margin
 * over the 5-min cap covers clock skew + slow last-step persistence.
 */
export const RUNNING_STALE_THRESHOLD_MS = 10 * 60 * 1000;

export interface ClassifyTimeInputs {
  readonly now?: number;
  readonly staleThresholdMs?: number;
}

/**
 * Classification for queue redelivery — decides whether to ack without
 * work or proceed to an atomic claim. Caller owns all side-effects
 * (ack/retry).
 *
 * RUNNING handling is gated by BOTH `attempts` AND row staleness:
 *   - `attempts === 1` — concurrent duplicate delivery, defer to the
 *      in-flight consumer.
 *   - `attempts > 1` AND row is fresh (updated within
 *      `staleThresholdMs`) — slow workflow still alive; ack-running
 *      to avoid double-execution against a still-live consumer.
 *   - `attempts > 1` AND row is stale (no `updated_at` change for
 *      longer than the threshold) — crash recovery; reclaim. The
 *      atomic `claimRun` UPDATE plus `current_run_id` guard is the
 *      mutex, and Mastra's runId-keyed D1 persistence is the
 *      double-execution backstop against the same run.
 *
 * SUSPENDED_HITL is terminal for this consumer: the workflow paused
 * itself awaiting reviewer action; the next move comes from
 * `POST /api/cases/:id/action` (Phase 7), not the queue.
 *
 * FAILED is terminal for this runId: the DLQ flipped it. Producer
 * retry mints a fresh runId via `producerGuard`, so this WHERE never
 * matches a legitimate fresh attempt — only stale main-queue messages
 * for an already-DLQ'd run, which we ack.
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
      return isStaleClaim(row, time) && attempts > 1 ? "claim" : "ack-running";
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

import { makeDb, signals, type NewSignal } from "@mizan/db";
import type { CloudflareBindings } from "@mizan/worker/env";
import type { PhotoSignalPayload } from "../../schemas/photo-signal.ts";
import type { VouchingChain } from "../../schemas/vouching.ts";
import type { StoryCoherencePayload } from "../../schemas/brief.ts";

/** Discriminated union of (signal_type, payload) pairs upsertable from Phase 4 steps. */
export type SignalUpsertInput =
  | { readonly signalType: "photo_dup"; readonly payload: PhotoSignalPayload }
  | { readonly signalType: "story_coherence"; readonly payload: StoryCoherencePayload }
  | { readonly signalType: "vouching_chain"; readonly payload: VouchingChain };

/**
 * Upserts one signal row keyed by `(case_id, run_id, signal_type)`.
 *
 * Idempotent on conflict — the unique index added in migration 0002 backs
 * `onConflictDoUpdate` so workflow retries (queue redelivery, manual rerun)
 * produce stable signal-row identity instead of accumulating duplicates.
 *
 * Wraps drizzle errors with the (case_id, run_id, signal_type) tuple for
 * on-call triage — D1's raw constraint errors do not surface workflow context.
 */
export async function upsertSignal(
  input: SignalUpsertInput & {
    readonly env: CloudflareBindings;
    readonly caseId: string;
    readonly runId: string;
  },
): Promise<void> {
  const db = makeDb(input.env.DB);
  const recordedAt = new Date();
  const row: NewSignal = {
    case_id: input.caseId,
    run_id: input.runId,
    signal_type: input.signalType,
    payload_json: input.payload,
    recorded_at: recordedAt,
  };
  try {
    await db
      .insert(signals)
      .values(row)
      .onConflictDoUpdate({
        target: [signals.case_id, signals.run_id, signals.signal_type],
        set: {
          payload_json: input.payload,
          recorded_at: recordedAt,
        },
      });
  } catch (cause) {
    throw new Error(
      `upsertSignal failed (case_id=${input.caseId} run_id=${input.runId} signal_type=${input.signalType}): ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
}

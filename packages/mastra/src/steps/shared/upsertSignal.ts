import {
  makeDb,
  resolveCaseOrganizationId,
  signals,
  buildSignalPersistedEmits,
  type NewSignal,
} from "@mizan/db";
import type { CloudflareBindings } from "@mizan/shared";
import type { PhotoSignalPayload, StoryCoherencePayload, VouchingChain } from "@mizan/shared";
import { emitLiveEventsBestEffort } from "./emit-live-events.ts";

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
 *
 * Accepts a structural `Pick<CloudflareBindings, "DB">` so integration
 * tests can pass the `env` imported from `cloudflare:workers` without
 * tripping `exactOptionalPropertyTypes` on unrelated bindings (KV, R2,
 * etc.) whose overloaded `.get` signatures differ nominally between the
 * workerd-generated `Cloudflare.Env` namespace and the
 * `@cloudflare/workers-types` interfaces used by `CloudflareBindings`.
 */
export async function upsertSignal(
  input: SignalUpsertInput & {
    readonly env: Pick<CloudflareBindings, "DB">;
    readonly caseId: string;
    readonly runId: string;
  },
): Promise<void> {
  const db = makeDb(input.env.DB);
  const recordedAt = new Date();
  const organizationId = await resolveCaseOrganizationId(db, input.caseId);
  const row: NewSignal = {
    case_id: input.caseId,
    run_id: input.runId,
    signal_type: input.signalType,
    payload_json: input.payload,
    recorded_at: recordedAt,
    organization_id: organizationId,
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
    await emitLiveEventsBestEffort(
      db,
      buildSignalPersistedEmits({
        caseId: input.caseId,
        runId: input.runId,
        organizationId,
        signalType: input.signalType,
      }),
      input.caseId,
    );
  } catch (cause) {
    throw new Error(
      `upsertSignal failed (case_id=${input.caseId} run_id=${input.runId} signal_type=${input.signalType}): ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
}

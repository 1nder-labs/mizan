import { makeDb, signals } from "@mizan/db";
import type { CloudflareBindings } from "@mizan/worker/env";

type SignalType = "photo_dup" | "story_coherence" | "vouching_chain";

/** Upserts one signal row keyed by (case_id, run_id, signal_type). */
export async function upsertSignal(
  env: CloudflareBindings,
  caseId: string,
  runId: string,
  signalType: SignalType,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = makeDb(env.DB);
  const recordedAt = new Date();
  await db
    .insert(signals)
    .values({
      case_id: caseId,
      run_id: runId,
      signal_type: signalType,
      payload_json: payload,
      recorded_at: recordedAt,
    })
    .onConflictDoUpdate({
      target: [signals.case_id, signals.run_id, signals.signal_type],
      set: {
        payload_json: payload,
        recorded_at: recordedAt,
      },
    });
}

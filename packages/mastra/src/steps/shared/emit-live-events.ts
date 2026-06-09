import { executeEmit, type Db, type EmitLiveEventInput } from "@mizan/db";

/**
 * Best-effort live-event emit for workflow steps where D1 batch is unavailable.
 */
export async function emitLiveEventsBestEffort(
  db: Db,
  emits: readonly EmitLiveEventInput[],
  caseId: string,
): Promise<void> {
  for (const emit of emits) {
    try {
      await executeEmit(db, emit);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(
        `[live_event] emit failed (event_type=${emit.eventType} case=${caseId}): ${reason}`,
      );
    }
  }
}

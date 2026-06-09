import { sql } from "drizzle-orm";
import { live_events } from "./schema.ts";
import type { Db } from "./index.ts";
import type { LiveEventPayload } from "@mizan/shared";

export interface EmitLiveEventInput {
  readonly topic: string;
  readonly eventType: LiveEventPayload["event_type"];
  readonly payload: LiveEventPayload;
  readonly organizationId: string | null;
  readonly actorUserId: string | null;
}

const MAX_EMIT_RETRIES = 3;

function buildSeqSubquery(topic: string) {
  return sql`(SELECT COALESCE(MAX(seq), 0) + 1 FROM live_events WHERE topic = ${topic})`;
}

function buildLiveEventValues(input: EmitLiveEventInput) {
  return {
    topic: input.topic,
    event_type: input.eventType,
    payload_json: input.payload,
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    seq: buildSeqSubquery(input.topic),
  };
}

/**
 * Returns a D1 batch item for inclusion in `db.batch([primary, emit])`.
 */
export function emitLiveEvent(db: Db, input: EmitLiveEventInput) {
  return db.insert(live_events).values(buildLiveEventValues(input));
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("UNIQUE constraint failed");
}

/**
 * Runs a live-event insert standalone. Retries on topic+seq unique violations.
 */
export async function executeEmit(db: Db, input: EmitLiveEventInput): Promise<{ seq: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_EMIT_RETRIES; attempt += 1) {
    try {
      const inserted = await db
        .insert(live_events)
        .values(buildLiveEventValues(input))
        .returning({ seq: live_events.seq })
        .get();
      if (!inserted) {
        throw new Error(`executeEmit: insert returned no row (topic=${input.topic})`);
      }
      return { seq: inserted.seq };
    } catch (error) {
      lastError = error;
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`executeEmit: exhausted retries for topic=${input.topic}`);
}

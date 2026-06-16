/**
 * Worker-side client for the brief-stream Durable Object (`BriefStreamDO`).
 *
 * Everything crosses the DO boundary as a plain string body, so these helpers
 * stay free of the workers-types/DOM stream-type split. One instance per
 * `runId`, addressed by `idFromName(runId)`.
 *
 * FINISH SEMANTICS (load-bearing for durability): `finishBriefStream` is sent
 * ONLY when the run reaches a terminal state — success (the workflow suspended
 * for HITL) or terminal failure (the DLQ gave up). It is NOT sent on a retried
 * attempt: a mid-run failure leaves the DO un-finished so the redelivered run
 * (which Mastra's D1Store resumes from the last persisted step) keeps appending
 * to the SAME buffer. Finishing early would mark the DO done, silently drop the
 * retry's chunks, and strand subscribers on a truncated brief.
 */
import type { CloudflareBindings } from "../env.ts";

const PUBLISH_URL = "https://brief-stream/?op=publish";
const FINISH_URL = "https://brief-stream/?op=finish";

/**
 * Shared DO-stub resolver — one instance per `runId`, addressed by
 * `idFromName(runId)`. Exported so the route layer can subscribe directly
 * without duplicating the binding resolution.
 */
export function stub(env: CloudflareBindings, runId: string) {
  return env.BRIEF_STREAM.get(env.BRIEF_STREAM.idFromName(runId));
}

/** Relays one SSE chunk to the run's DO (buffered + broadcast to subscribers). */
export async function publishBriefChunk(
  env: CloudflareBindings,
  runId: string,
  text: string,
): Promise<void> {
  const res = await stub(env, runId).fetch(PUBLISH_URL, { method: "POST", body: text });
  if (!res.ok) {
    throw new Error(`publishBriefChunk failed (op=publish status=${res.status} runId=${runId})`);
  }
}

/** Marks the run's DO stream terminal — closes live subscribers + persists the done flag. */
export async function finishBriefStream(env: CloudflareBindings, runId: string): Promise<void> {
  const res = await stub(env, runId).fetch(FINISH_URL, { method: "POST" });
  if (!res.ok) {
    throw new Error(`finishBriefStream failed (op=finish status=${res.status} runId=${runId})`);
  }
}

/**
 * Best-effort terminal close. Used by BOTH terminal sites (consumer success path,
 * DLQ exhaustion): the run already reached its terminal/suspended state and the
 * brief is persisted, so a failed DO close must not propagate — rethrowing would
 * make the consumer retry an already-succeeded run, or block the DLQ from acking
 * an already-FAILED case (causing redelivery churn). The failed close only
 * affects live-subscriber cleanup; the DO closes on its own idle timeout anyway.
 */
export async function bestEffortFinishBriefStream(
  env: CloudflareBindings,
  runId: string,
): Promise<void> {
  try {
    await finishBriefStream(env, runId);
  } catch (err) {
    console.error("finishBriefStream failed at terminal (best-effort)", {
      runId,
      msg: err instanceof Error ? err.message : String(err),
    });
  }
}

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

function stub(env: CloudflareBindings, runId: string) {
  return env.BRIEF_STREAM.get(env.BRIEF_STREAM.idFromName(runId));
}

/** Relays one SSE chunk to the run's DO (buffered + broadcast to subscribers). */
export async function publishBriefChunk(
  env: CloudflareBindings,
  runId: string,
  text: string,
): Promise<void> {
  await stub(env, runId).fetch(PUBLISH_URL, { method: "POST", body: text });
}

/** Marks the run's DO stream terminal — closes live subscribers + persists the done flag. */
export async function finishBriefStream(env: CloudflareBindings, runId: string): Promise<void> {
  await stub(env, runId).fetch(FINISH_URL, { method: "POST" });
}

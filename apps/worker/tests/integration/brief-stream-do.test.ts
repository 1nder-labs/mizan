/**
 * Integration: the BriefStreamDO resumable-stream store (no workflow involved).
 *
 * Proves the durability mechanism in isolation: chunks published to the DO are
 * buffered + replayed to a late subscriber (resume), streamed live to a
 * connected subscriber, and the stream closes on finish. This is what lets a
 * brief run to completion + be re-watched regardless of any client connection.
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const SUBSCRIBE_URL = "https://brief-stream/subscribe";
const op = (name: string): string => `https://brief-stream/?op=${name}`;

function stubFor(runId: string) {
  return env.BRIEF_STREAM.get(env.BRIEF_STREAM.idFromName(runId));
}

async function readAll(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("BriefStreamDO", () => {
  it("buffers published chunks and replays them to a late subscriber (resume)", async () => {
    const stub = stubFor(`do-replay-${Date.now()}`);
    await stub.fetch(op("publish"), { method: "POST", body: "data: a\n\n" });
    await stub.fetch(op("publish"), { method: "POST", body: "data: b\n\n" });
    await stub.fetch(op("finish"), { method: "POST" });

    const res = await stub.fetch(SUBSCRIBE_URL);
    expect(await readAll(res.body)).toBe("data: a\n\ndata: b\n\n");
  });

  it("delivers live to a connected subscriber, then closes on finish", async () => {
    const stub = stubFor(`do-live-${Date.now()}`);
    const res = await stub.fetch(SUBSCRIBE_URL);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no subscriber body");
    const decoder = new TextDecoder();

    await stub.fetch(op("publish"), { method: "POST", body: "live-1" });
    const first = await reader.read();
    expect(decoder.decode(first.value)).toBe("live-1");

    await stub.fetch(op("finish"), { method: "POST" });
    const end = await reader.read();
    expect(end.done).toBe(true);
  });

  it("ignores publishes after finish (idempotent re-delivery guard)", async () => {
    const stub = stubFor(`do-after-finish-${Date.now()}`);
    await stub.fetch(op("publish"), { method: "POST", body: "first" });
    await stub.fetch(op("finish"), { method: "POST" });
    await stub.fetch(op("publish"), { method: "POST", body: "late" });

    const res = await stub.fetch(SUBSCRIBE_URL);
    expect(await readAll(res.body)).toBe("first");
  });

  /**
   * TG-003: hydrate reads in ≤128-key batches. A brief longer than one batch
   * (here 200 chunks) must replay in full + in order — a single `storage.get`
   * would cap at 128 and truncate the buffer.
   */
  it("replays a buffer larger than the 128-key storage batch in full", async () => {
    const stub = stubFor(`do-paged-${Date.now()}`);
    const total = 200;
    for (let i = 0; i < total; i++) {
      await stub.fetch(op("publish"), { method: "POST", body: `c${i};` });
    }
    await stub.fetch(op("finish"), { method: "POST" });

    const res = await stub.fetch(SUBSCRIBE_URL);
    const expected = Array.from({ length: total }, (_, i) => `c${i};`).join("");
    expect(await readAll(res.body)).toBe(expected);
  });

  /**
   * TG-001: a disconnected subscriber must be dropped so the broadcast loop
   * doesn't pin the DO open enqueueing into a dead controller. After cancelling
   * the reader, further publishes + a fresh subscribe must still succeed (the DO
   * keeps running; only the live view detached) and the new subscriber sees the
   * complete buffer including chunks sent after the disconnect.
   */
  it("drops a subscriber that disconnects mid-stream and keeps serving others", async () => {
    const stub = stubFor(`do-disconnect-${Date.now()}`);
    await stub.fetch(op("publish"), { method: "POST", body: "before;" });

    const dropped = await stub.fetch(SUBSCRIBE_URL);
    const reader = dropped.body?.getReader();
    if (!reader) throw new Error("no subscriber body");
    await reader.read();
    await reader.cancel("client gone");

    await stub.fetch(op("publish"), { method: "POST", body: "after;" });
    await stub.fetch(op("finish"), { method: "POST" });

    const res = await stub.fetch(SUBSCRIBE_URL);
    expect(await readAll(res.body)).toBe("before;after;");
  });

  /**
   * TG-002 / ADV-001: a run that throws BEFORE relaying any chunk leaves the DO
   * un-finished (the consumer never finishes on failure, so retries can resume).
   * The DLQ consumer's terminal `finishBriefStream` is what closes the stream —
   * modelled here as a bare finish with no prior publish. A waiting subscriber
   * must get a clean close, not hang forever.
   */
  it("closes a never-published stream when finished (terminal DLQ signal)", async () => {
    const stub = stubFor(`do-empty-finish-${Date.now()}`);
    const res = await stub.fetch(SUBSCRIBE_URL);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no subscriber body");

    await stub.fetch(op("finish"), { method: "POST" });
    const end = await reader.read();
    expect(end.done).toBe(true);
  });

  /**
   * TG-004: a retry appends to the SAME buffer. Publishing a second batch after
   * the first (no finish between — finish is terminal-only) must accumulate, so
   * a resume after the retry sees both batches. This is why `relayToBriefStream`
   * publishes-only and finish is owned by the terminal outcome.
   */
  it("accumulates a retried run's chunks into the same buffer (no early finish)", async () => {
    const stub = stubFor(`do-retry-${Date.now()}`);
    await stub.fetch(op("publish"), { method: "POST", body: "attempt1;" });
    await stub.fetch(op("publish"), { method: "POST", body: "attempt2;" });
    await stub.fetch(op("finish"), { method: "POST" });

    const res = await stub.fetch(SUBSCRIBE_URL);
    expect(await readAll(res.body)).toBe("attempt1;attempt2;");
  });
});

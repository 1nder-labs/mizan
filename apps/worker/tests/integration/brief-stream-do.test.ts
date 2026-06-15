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
});

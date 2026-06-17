import { describe, expect, it, mock } from "bun:test";
import type { CloudflareBindings } from "../../src/env.ts";
import {
  bestEffortFinishBriefStream,
  finishBriefStream,
} from "../../src/durable/brief-stream-client.ts";

/**
 * The terminal DO close must be best-effort. The DLQ consumer calls
 * `bestEffortFinishBriefStream` AFTER flipping the case to FAILED and BEFORE
 * `msg.ack()`; if a transient DO failure propagated, the ack would be skipped
 * and the DLQ message would redeliver forever against an already-FAILED case.
 * `bestEffortFinishBriefStream` must therefore swallow (log, not throw), while
 * the raw `finishBriefStream` still throws so the consumer's success path can
 * detect a real close failure.
 */
function envWithFinishStatus(status: number): CloudflareBindings {
  const stub = { fetch: () => Promise.resolve(new Response(null, { status })) };
  return {
    BRIEF_STREAM: { idFromName: (name: string) => name, get: () => stub },
  } as unknown as CloudflareBindings;
}

describe("bestEffortFinishBriefStream", () => {
  it("resolves without throwing when the DO finish returns 500 (DLQ can still ack)", async () => {
    const errorSpy = mock(() => undefined);
    const original = console.error;
    console.error = errorSpy;
    try {
      await expect(
        bestEffortFinishBriefStream(envWithFinishStatus(500), "run-1"),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      console.error = original;
    }
  });

  it("resolves without logging on a clean 204 finish", async () => {
    const errorSpy = mock(() => undefined);
    const original = console.error;
    console.error = errorSpy;
    try {
      await expect(
        bestEffortFinishBriefStream(envWithFinishStatus(204), "run-2"),
      ).resolves.toBeUndefined();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      console.error = original;
    }
  });

  it("raw finishBriefStream THROWS on a non-2xx so the success path detects a real failure", async () => {
    await expect(finishBriefStream(envWithFinishStatus(500), "run-3")).rejects.toThrow(
      /finishBriefStream failed/,
    );
  });
});

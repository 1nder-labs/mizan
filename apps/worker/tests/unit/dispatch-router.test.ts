import { describe, expect, it, mock } from "bun:test";
import type { MessageBatch } from "@cloudflare/workers-types";
import { makeTestBatch, makeTestExecutionContext } from "../helpers/queue-batch.ts";

const handleBriefQueue = mock(() => Promise.resolve());
const handleDlq = mock(() => Promise.resolve());

mock.module("../../src/queue/brief-consumer.ts", () => ({
  handleBriefQueue,
}));

mock.module("../../src/queue/dlq-consumer.ts", () => ({
  handleDlq,
}));

const { dispatchQueue } = await import("../../src/queue/dispatch.ts");

function emptyBatch(queue: string): MessageBatch<unknown> {
  return makeTestBatch([], queue);
}

describe("dispatchQueue", () => {
  it("routes mizan-brief-jobs to handleBriefQueue", async () => {
    handleBriefQueue.mockClear();
    const batch = emptyBatch("mizan-brief-jobs");
    const env = {} as import("../../src/env.ts").CloudflareBindings;
    const ctx = makeTestExecutionContext();
    await dispatchQueue(batch, env, ctx);
    expect(handleBriefQueue).toHaveBeenCalledTimes(1);
    expect(handleBriefQueue).toHaveBeenCalledWith(batch, env, ctx);
  });

  it("routes mizan-brief-jobs-dlq to handleDlq", async () => {
    handleDlq.mockClear();
    const batch = emptyBatch("mizan-brief-jobs-dlq");
    const env = {} as import("../../src/env.ts").CloudflareBindings;
    const ctx = makeTestExecutionContext();
    await dispatchQueue(batch, env, ctx);
    expect(handleDlq).toHaveBeenCalledTimes(1);
    expect(handleDlq).toHaveBeenCalledWith(batch, env);
  });

  it("throws for unknown queue names", async () => {
    const batch = emptyBatch("unknown-queue");
    const env = {} as import("../../src/env.ts").CloudflareBindings;
    const ctx = makeTestExecutionContext();
    await expect(dispatchQueue(batch, env, ctx)).rejects.toThrow("unknown queue");
  });
});

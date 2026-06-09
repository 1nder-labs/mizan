import { describe, expect, it } from "bun:test";
import type { KVNamespace } from "@cloudflare/workers-types";
import { tryReadCachedActionResponse } from "../../src/lib/action-cache.ts";

/**
 * Layer 4 cache reads must degrade to a miss on KV failure, never crash the
 * action with a 500. The atomic SUSPENDED_HITL→RUNNING claim downstream is what
 * actually prevents a double-apply, so a missed cache read is always safe.
 */
const throwingKv = {
  get: () => Promise.reject(new Error("KV unavailable")),
} as unknown as KVNamespace;

describe("tryReadCachedActionResponse", () => {
  it("returns undefined (cache miss) when KV throws, instead of propagating", async () => {
    const result = await tryReadCachedActionResponse(throwingKv, "u1", "c1", "a1");
    expect(result).toBeUndefined();
  });
});

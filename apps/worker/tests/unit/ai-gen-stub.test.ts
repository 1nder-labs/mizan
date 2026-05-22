import { describe, expect, it } from "bun:test";
import { aiGenStub } from "@mizan/mastra";

const SALT = "11111111-1111-4111-8111-111111111101";

describe("aiGenStub", () => {
  it("returns stub-v1 model", async () => {
    const result = await aiGenStub({ r2_key: "fixture-key-001", salt: SALT });
    expect(result.model).toBe("stub-v1");
  });

  it("is deterministic for the same (key, salt) pair", async () => {
    const first = await aiGenStub({ r2_key: "fixture-key-001", salt: SALT });
    const second = await aiGenStub({ r2_key: "fixture-key-001", salt: SALT });
    expect(first).toEqual(second);
  });

  it("covers probability buckets across keys", async () => {
    const buckets = new Set<string>();
    for (const index of [0, 1, 2, 3, 4, 5]) {
      const result = await aiGenStub({
        r2_key: `bucket-key-${String(index)}`,
        salt: SALT,
      });
      buckets.add(result.probability);
    }
    expect(buckets.size).toBeGreaterThanOrEqual(2);
  });

  it("returns one of four probability labels", async () => {
    const result = await aiGenStub({ r2_key: "any-key", salt: SALT });
    expect(["low", "medium", "high", "very_high"]).toContain(result.probability);
  });
});

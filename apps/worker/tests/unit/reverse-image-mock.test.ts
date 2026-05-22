import { describe, expect, it } from "bun:test";
import { mockReverseImageSearch } from "@mizan/mastra";

describe("mockReverseImageSearch", () => {
  it("returns valid shape", async () => {
    const result = await mockReverseImageSearch({ r2_key: "fixture-key-001" });
    expect(result.checked_at.length).toBeGreaterThan(0);
    expect(result.hits.length).toBeLessThanOrEqual(3);
    expect(result.hits.every((hit) => hit.confidence >= 0 && hit.confidence <= 1)).toBe(true);
  });

  it("is deterministic for hits", async () => {
    const first = await mockReverseImageSearch({ r2_key: "fixture-key-001" });
    const second = await mockReverseImageSearch({ r2_key: "fixture-key-001" });
    expect(first.hits).toEqual(second.hits);
  });

  it("varies hits across keys", async () => {
    const a = await mockReverseImageSearch({ r2_key: "key-a" });
    const b = await mockReverseImageSearch({ r2_key: "key-b" });
    expect(a.hits.length !== b.hits.length || a.hits[0]?.url !== b.hits[0]?.url).toBe(true);
  });
});

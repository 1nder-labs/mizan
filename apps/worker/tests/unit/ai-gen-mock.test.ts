import { describe, expect, it } from "bun:test";
import { mockAiGenDetection } from "@mizan/mastra";

describe("mockAiGenDetection", () => {
  it("returns mock-v1 model", async () => {
    const result = await mockAiGenDetection({ r2_key: "fixture-key-001" });
    expect(result.model).toBe("mock-v1");
  });

  it("is deterministic for probability", async () => {
    const first = await mockAiGenDetection({ r2_key: "fixture-key-001" });
    const second = await mockAiGenDetection({ r2_key: "fixture-key-001" });
    expect(first.probability).toBe(second.probability);
  });

  it("covers probability buckets across keys", async () => {
    const buckets = new Set<string>();
    for (const index of [0, 1, 2, 3, 4, 5]) {
      const result = await mockAiGenDetection({ r2_key: `bucket-key-${String(index)}` });
      buckets.add(result.probability);
    }
    expect(buckets.size).toBeGreaterThanOrEqual(2);
  });

  it("returns one of four probability labels", async () => {
    const result = await mockAiGenDetection({ r2_key: "any-key" });
    expect(["low", "medium", "high", "very_high"]).toContain(result.probability);
  });
});

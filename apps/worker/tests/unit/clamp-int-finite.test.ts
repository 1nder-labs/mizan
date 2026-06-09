import { describe, expect, it } from "bun:test";
import { clampInt } from "@mizan/shared";

/**
 * `clampInt` is the last gate before LLM confidence numbers land on
 * `briefs.confidence` / `briefs.payload_json`. A NaN slipping past
 * Zod's number check (zod's `z.number()` rejects NaN, but the field
 * historically used `z.number()` without `.finite()` so any
 * caller-side construction of a brief object could carry NaN) must
 * collapse to a defined integer, not propagate.
 */
describe("clampInt finite guard", () => {
  it("collapses NaN to min", () => {
    expect(clampInt(Number.NaN, 0, 100)).toBe(0);
    expect(clampInt(Number.NaN, 5, 99)).toBe(5);
  });

  it("collapses +Infinity to min (not max — non-finite is treated as malformed input, not as an extreme value)", () => {
    expect(clampInt(Number.POSITIVE_INFINITY, 0, 100)).toBe(0);
  });

  it("collapses -Infinity to min", () => {
    expect(clampInt(Number.NEGATIVE_INFINITY, 0, 100)).toBe(0);
  });

  it("truncates fractional values within range", () => {
    expect(clampInt(42.9, 0, 100)).toBe(42);
    expect(clampInt(-0.5, 0, 100)).toBe(0);
  });

  it("clamps below min", () => {
    expect(clampInt(-50, 0, 100)).toBe(0);
  });

  it("clamps above max", () => {
    expect(clampInt(500, 0, 100)).toBe(100);
  });

  it("passes through in-range integers verbatim", () => {
    expect(clampInt(42, 0, 100)).toBe(42);
    expect(clampInt(0, 0, 100)).toBe(0);
    expect(clampInt(100, 0, 100)).toBe(100);
  });
});

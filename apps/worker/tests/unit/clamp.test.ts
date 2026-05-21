import { describe, expect, it } from "vitest";
import { clampInt, ensureUuid } from "@mizan/shared";

describe("clampInt", () => {
  it("clamps above max", () => {
    expect(clampInt(150, 0, 100)).toBe(100);
  });

  it("clamps below min", () => {
    expect(clampInt(-5, 0, 100)).toBe(0);
  });

  it("truncates fractional values", () => {
    expect(clampInt(50.7, 0, 100)).toBe(50);
  });
});

describe("ensureUuid", () => {
  it("accepts valid UUID v4 shape", () => {
    const id = crypto.randomUUID();
    expect(ensureUuid(id, "caseId")).toBe(id);
  });

  it("throws on invalid shape", () => {
    expect(() => ensureUuid("not-a-uuid", "caseId")).toThrow("caseId is not a valid UUID");
  });
});

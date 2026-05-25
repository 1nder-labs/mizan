import { describe, expect, it } from "bun:test";
import { normalizeStoredRationale } from "../../src/steps/record-action-helpers.ts";

describe("normalizeStoredRationale", () => {
  it("returns trimmed rationale when non-empty", () => {
    expect(normalizeStoredRationale("  needs review  ")).toBe("needs review");
  });

  it("returns placeholder when rationale is empty", () => {
    expect(normalizeStoredRationale("")).toBe("(none)");
    expect(normalizeStoredRationale("   ")).toBe("(none)");
  });
});

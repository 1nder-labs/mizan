import { describe, expect, it } from "bun:test";
import { deriveOptionDisabled } from "../../src/components/case/case-assignment-policy.ts";

const VIEWER = "user-1";
const OTHER = "user-2";

describe("deriveOptionDisabled", () => {
  it("enables every option for admins", () => {
    expect(deriveOptionDisabled("admin", null, OTHER, VIEWER)).toBe(false);
    expect(deriveOptionDisabled("admin", OTHER, VIEWER, VIEWER)).toBe(false);
  });

  it("lets a reviewer claim their own option on an unassigned case", () => {
    expect(deriveOptionDisabled("reviewer", null, VIEWER, VIEWER)).toBe(false);
  });

  it("lets a reviewer keep their own option when already theirs", () => {
    expect(deriveOptionDisabled("reviewer", VIEWER, VIEWER, VIEWER)).toBe(false);
  });

  it("disables other members' options for a reviewer", () => {
    expect(deriveOptionDisabled("reviewer", null, OTHER, VIEWER)).toBe(true);
    expect(deriveOptionDisabled("reviewer", VIEWER, OTHER, VIEWER)).toBe(true);
  });

  it("enables the unassign option only when the case is the reviewer's", () => {
    expect(deriveOptionDisabled("reviewer", VIEWER, null, VIEWER)).toBe(false);
    expect(deriveOptionDisabled("reviewer", OTHER, null, VIEWER)).toBe(true);
  });
});

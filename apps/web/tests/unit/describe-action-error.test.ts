import { describe, expect, it } from "bun:test";
import { ReviewerActionError } from "../../src/lib/api-errors.ts";
import { describeActionError } from "../../src/lib/describe-action-error.ts";

describe("describeActionError", () => {
  it("maps each reviewer-action code to user copy", () => {
    expect(describeActionError(new ReviewerActionError("not_suspended_or_claimed", 409))).toBe(
      "Another reviewer acted on this case",
    );
    expect(describeActionError(new ReviewerActionError("not_found", 404))).toBe("Case not found");
    expect(describeActionError(new ReviewerActionError("no_run", 409))).toBe(
      "Case has no active workflow run",
    );
    expect(describeActionError(new ReviewerActionError("workflow_failed", 500))).toBe(
      "Workflow failed to resume — try again",
    );
  });

  it("passes through a generic Error message", () => {
    expect(describeActionError(new Error("network down"))).toBe("network down");
  });

  it("falls back to a default for a non-Error value", () => {
    expect(describeActionError("boom")).toBe("Action failed");
  });
});

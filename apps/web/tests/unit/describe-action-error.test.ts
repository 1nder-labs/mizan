import { describe, expect, it } from "bun:test";
import { ReviewerActionError } from "../../src/lib/api-errors.ts";
import { describeActionError } from "../../src/lib/describe-action-error.ts";
import { COPY } from "../../src/lib/copy-constants.ts";

describe("describeActionError", () => {
  it("maps each reviewer-action code to its unified user copy", () => {
    expect(describeActionError(new ReviewerActionError("not_suspended_or_claimed", 409))).toBe(
      COPY.apiError.not_suspended_or_claimed,
    );
    expect(describeActionError(new ReviewerActionError("not_found", 404))).toBe(
      COPY.apiError.not_found,
    );
    expect(describeActionError(new ReviewerActionError("no_run", 409))).toBe(COPY.apiError.no_run);
    expect(describeActionError(new ReviewerActionError("workflow_failed", 500))).toBe(
      COPY.apiError.workflow_failed,
    );
  });

  it("passes through a generic (non-API) Error message", () => {
    expect(describeActionError(new Error("network down"))).toBe("network down");
  });

  it("falls back for a non-Error value", () => {
    expect(describeActionError("boom")).toBe(COPY.apiError.fallback);
  });
});

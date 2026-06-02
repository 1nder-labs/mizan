import { describe, expect, it } from "bun:test";
import { resolveReviewOrgId } from "../../src/lib/review-org.ts";

/**
 * `resolveReviewOrgId` is the fail-loud guard for the single review org that
 * client self-signups join. A blank value must throw so a misconfigured
 * worker surfaces the error at the first client signup instead of silently
 * dropping the user into no org.
 */
describe("resolveReviewOrgId", () => {
  it("returns the configured id", () => {
    expect(resolveReviewOrgId({ REVIEW_ORG_ID: "org-abc123" })).toBe("org-abc123");
  });

  it("throws when unset (empty string)", () => {
    expect(() => resolveReviewOrgId({ REVIEW_ORG_ID: "" })).toThrow(/REVIEW_ORG_ID is unset/);
  });

  it("throws when blank (whitespace only)", () => {
    expect(() => resolveReviewOrgId({ REVIEW_ORG_ID: "   " })).toThrow(/REVIEW_ORG_ID is unset/);
  });
});

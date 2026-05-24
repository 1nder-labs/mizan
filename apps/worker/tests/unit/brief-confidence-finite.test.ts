import { describe, expect, it } from "bun:test";
import { BriefPayloadSchema } from "@mizan/shared";

const BASE = {
  recommendation: "READY_FOR_REVIEW" as const,
  verification_path: "documentary" as const,
  geography_tier: "SAFE" as const,
  policy_grounded: true,
  missing_docs: [],
  reviewer_questions: [],
  extracted_claims: "ok",
  policy_citations: [],
};

/**
 * `BriefPayloadSchema.confidence` carries a `.finite()` refinement so a
 * non-finite value (NaN / ±Infinity) cannot land in `briefs.payload_json`
 * via a `BriefPayloadSchema.parse` boundary. `clampInt` covers the
 * runtime clamp path; this test pins the parse-time veto.
 */
describe("BriefPayloadSchema.confidence finite refinement", () => {
  it("rejects NaN", () => {
    expect(() => BriefPayloadSchema.parse({ ...BASE, confidence: Number.NaN })).toThrow();
  });

  it("rejects +Infinity", () => {
    expect(() =>
      BriefPayloadSchema.parse({ ...BASE, confidence: Number.POSITIVE_INFINITY }),
    ).toThrow();
  });

  it("rejects -Infinity", () => {
    expect(() =>
      BriefPayloadSchema.parse({ ...BASE, confidence: Number.NEGATIVE_INFINITY }),
    ).toThrow();
  });

  it("accepts finite integers in range", () => {
    expect(BriefPayloadSchema.parse({ ...BASE, confidence: 75 }).confidence).toBe(75);
  });

  it("accepts the range endpoints (0 and 100)", () => {
    expect(BriefPayloadSchema.parse({ ...BASE, confidence: 0 }).confidence).toBe(0);
    expect(BriefPayloadSchema.parse({ ...BASE, confidence: 100 }).confidence).toBe(100);
  });
});

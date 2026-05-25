import { describe, expect, it } from "bun:test";
import {
  ReviewerActionResumeSchema,
  ReviewerActionSuspendSchema,
} from "../../src/schemas/reviewer-action-suspend.ts";

const BRIEF = {
  recommendation: "READY_FOR_REVIEW" as const,
  verification_path: "documentary" as const,
  geography_tier: "SAFE" as const,
  policy_grounded: true,
  missing_docs: [],
  reviewer_questions: [],
  extracted_claims: "claims",
  confidence: 80,
  policy_citations: [],
};

describe("ReviewerActionSuspendSchema", () => {
  it("accepts a valid suspend payload", () => {
    const result = ReviewerActionSuspendSchema.parse({
      awaiting: "reviewer_action",
      caseId: "550e8400-e29b-41d4-a716-446655440001",
      runId: "550e8400-e29b-41d4-a716-446655440002",
      briefId: "550e8400-e29b-41d4-a716-446655440003",
      brief: BRIEF,
    });
    expect(result.awaiting).toBe("reviewer_action");
  });
});

describe("ReviewerActionResumeSchema", () => {
  it("rejects malformed resume data", () => {
    expect(() =>
      ReviewerActionResumeSchema.parse({
        action: "APPROVE",
        rationale: "",
        action_id: "not-uuid",
        reviewer_id: "",
      }),
    ).toThrow();
  });
});

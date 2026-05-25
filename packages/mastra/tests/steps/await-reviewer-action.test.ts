import { describe, expect, it } from "bun:test";
import {
  ReviewerActionResumeSchema,
  ReviewerActionStepStateSchema,
  ReviewerActionSuspendSchema,
} from "../../src/schemas/reviewer-action-suspend.ts";
import { mergeResumeAction } from "../../src/steps/await-reviewer-action-helpers.ts";

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

const CASE_ID = "550e8400-e29b-41d4-a716-446655440001";
const RUN_ID = "550e8400-e29b-41d4-a716-446655440002";
const BRIEF_ID = "550e8400-e29b-41d4-a716-446655440003";
const ACTION_ID = "550e8400-e29b-41d4-a716-446655440004";

describe("ReviewerActionSuspendSchema", () => {
  it("accepts a valid suspend payload", () => {
    const result = ReviewerActionSuspendSchema.parse({
      awaiting: "reviewer_action",
      caseId: CASE_ID,
      runId: RUN_ID,
      briefId: BRIEF_ID,
      brief: BRIEF,
    });
    expect(result.awaiting).toBe("reviewer_action");
  });

  it("rejects when briefId is not a UUID", () => {
    expect(() =>
      ReviewerActionSuspendSchema.parse({
        awaiting: "reviewer_action",
        caseId: CASE_ID,
        runId: RUN_ID,
        briefId: "nope",
        brief: BRIEF,
      }),
    ).toThrow();
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

  it("accepts a valid resume payload", () => {
    const result = ReviewerActionResumeSchema.parse({
      action: "ESCALATE",
      rationale: "needs higher review",
      action_id: ACTION_ID,
      reviewer_id: "reviewer-1",
    });
    expect(result.action).toBe("ESCALATE");
  });
});

describe("mergeResumeAction", () => {
  const baseState = {
    caseId: CASE_ID,
    runId: RUN_ID,
    brief: BRIEF,
  };

  it("merges parsed resume data onto the workflow state", () => {
    const merged = mergeResumeAction(baseState, {
      action: "APPROVE",
      rationale: "looks good",
      action_id: ACTION_ID,
      reviewer_id: "reviewer-1",
    });
    expect(merged.caseId).toBe(CASE_ID);
    expect(merged.reviewerAction.action).toBe("APPROVE");
    expect(merged.reviewerAction.action_id).toBe(ACTION_ID);
    expect(ReviewerActionStepStateSchema.safeParse(merged).success).toBe(true);
  });

  it("throws when resumeData fails schema validation", () => {
    expect(() =>
      mergeResumeAction(baseState, {
        action: "APPROVE",
        rationale: "",
        action_id: "nope",
        reviewer_id: "reviewer-1",
      }),
    ).toThrow();
  });
});

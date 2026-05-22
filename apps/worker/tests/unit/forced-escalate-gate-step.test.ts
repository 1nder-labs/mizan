import { describe, expect, it } from "bun:test";
import { assertGateInputs } from "@mizan/mastra";
import type { BriefPayload, PartialBriefState } from "@mizan/mastra";

const SAMPLE_BRIEF: BriefPayload = {
  recommendation: "READY_FOR_REVIEW",
  verification_path: "none",
  geography_tier: "OFAC_ADJACENT",
  missing_docs: [],
  reviewer_questions: [],
  extracted_claims: "",
  confidence: 50,
  policy_citations: [],
};

const SAMPLE_CLASSIFY = {
  verification_path: "none" as const,
  geography_tier: "OFAC_ADJACENT" as const,
};

function makeState(overrides: Partial<PartialBriefState> = {}): PartialBriefState {
  return {
    caseId: "case-id",
    runId: "run-id",
    ...overrides,
  };
}

describe("assertGateInputs (forcedEscalateGate state guards)", () => {
  it("returns the narrowed shape when brief + classify both present", () => {
    const result = assertGateInputs(makeState({ brief: SAMPLE_BRIEF, classify: SAMPLE_CLASSIFY }));
    expect(result.brief.recommendation).toBe("READY_FOR_REVIEW");
    expect(result.classify.verification_path).toBe("none");
  });

  it("throws when brief is missing", () => {
    expect(() => assertGateInputs(makeState({ classify: SAMPLE_CLASSIFY }))).toThrow(
      /brief missing/,
    );
  });

  it("throws when classify is missing", () => {
    expect(() => assertGateInputs(makeState({ brief: SAMPLE_BRIEF }))).toThrow(/classify missing/);
  });

  it("error message includes case_id and run_id for triage", () => {
    expect(() =>
      assertGateInputs({ caseId: "case-xyz", runId: "run-abc" } satisfies PartialBriefState),
    ).toThrow(/case-xyz/);
  });
});

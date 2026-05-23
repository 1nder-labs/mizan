import { describe, expect, it } from "bun:test";
import type { BriefPayload, PartialBriefState } from "@mizan/mastra";
import {
  assertFinalizeCaseStatusInputs,
  buildCaseNotFoundError,
} from "@mizan/mastra/testing";

const SAMPLE_BRIEF: BriefPayload = {
  recommendation: "READY_FOR_REVIEW",
  verification_path: "documentary",
  geography_tier: "SAFE",
  policy_grounded: true,
  missing_docs: [],
  reviewer_questions: [],
  extracted_claims: "Documentary evidence reviewed.",
  confidence: 75,
  policy_citations: [],
};

function makeState(overrides: Partial<PartialBriefState> = {}): PartialBriefState {
  return {
    caseId: "case-finalize-1",
    runId: "run-finalize-1",
    ...overrides,
  };
}

describe("assertFinalizeCaseStatusInputs", () => {
  it("returns void when brief is present", () => {
    expect(() => assertFinalizeCaseStatusInputs(makeState({ brief: SAMPLE_BRIEF }))).not.toThrow();
  });

  it("throws when brief slot is missing — upstream step failed silently", () => {
    expect(() => assertFinalizeCaseStatusInputs(makeState())).toThrow(/brief missing/);
  });

  it("error message includes case_id and run_id for triage", () => {
    expect(() =>
      assertFinalizeCaseStatusInputs({ caseId: "case-xyz", runId: "run-abc" }),
    ).toThrow(/case-xyz.*run-abc/);
  });
});

describe("buildCaseNotFoundError", () => {
  it("packs case_id and run_id into the message verbatim for on-call grep", () => {
    const err = buildCaseNotFoundError("case-finalize-7", "run-finalize-7");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("case-finalize-7");
    expect(err.message).toContain("run-finalize-7");
    expect(err.message).toContain("status flip did not occur");
  });
});

import { describe, expect, it } from "bun:test";
import type { BriefPayload } from "@mizan/shared";
import type { PartialBriefState } from "@mizan/mastra/testing";
import { assertGateInputs, escalateBriefProjection } from "@mizan/mastra/testing";

const SAMPLE_BRIEF: BriefPayload = {
  recommendation: "READY_FOR_REVIEW",
  verification_path: "none",
  geography_tier: "OFAC_ADJACENT",
  policy_grounded: true,
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

  /*
   * `composeBrief` stitches `verification_path` and `geography_tier`
   * onto the brief from `inputData.classify` so the reviewer-visible
   * brief shows the same numbers the gate predicates on. A future
   * post-compose step that overwrote either field would otherwise
   * produce a silent brief/state divergence — the gate predicates
   * `classify` while the reviewer reads `brief.*`. These tests pin the
   * alignment guard so the drift fails loud the moment it appears.
   */
  it("throws when brief.verification_path diverges from classify.verification_path", () => {
    const driftedBrief: BriefPayload = { ...SAMPLE_BRIEF, verification_path: "documentary" };
    expect(() =>
      assertGateInputs(makeState({ brief: driftedBrief, classify: SAMPLE_CLASSIFY })),
    ).toThrow(/brief\.verification_path=documentary but classify\.verification_path=none/);
  });

  it("throws when brief.geography_tier diverges from classify.geography_tier", () => {
    const driftedBrief: BriefPayload = { ...SAMPLE_BRIEF, geography_tier: "SAFE" };
    expect(() =>
      assertGateInputs(makeState({ brief: driftedBrief, classify: SAMPLE_CLASSIFY })),
    ).toThrow(/brief\.geography_tier=SAFE but classify\.geography_tier=OFAC_ADJACENT/);
  });
});

describe("escalateBriefProjection", () => {
  it("strips drafted_organizer_message and sets ESCALATE + reason", () => {
    const briefIn: BriefPayload = {
      ...SAMPLE_BRIEF,
      recommendation: "REQUEST_DOCS",
      drafted_organizer_message: {
        message: "Please send your government ID.",
        missing_items: ["creator_id"],
      },
    };
    const out = escalateBriefProjection({
      brief: briefIn,
      forced_escalate_reason: "verification_path=none + geography_tier=OFAC_ADJACENT",
    });
    expect(out.recommendation).toBe("ESCALATE");
    expect(out.drafted_organizer_message).toBeUndefined();
    expect(out.forced_escalate_reason).toContain("verification_path=none");
  });

  it("preserves other fields verbatim", () => {
    const out = escalateBriefProjection({
      brief: SAMPLE_BRIEF,
      forced_escalate_reason: "reason",
    });
    expect(out.policy_citations).toEqual(SAMPLE_BRIEF.policy_citations);
    expect(out.missing_docs).toEqual(SAMPLE_BRIEF.missing_docs);
    expect(out.extracted_claims).toBe(SAMPLE_BRIEF.extracted_claims);
    expect(out.verification_path).toBe(SAMPLE_BRIEF.verification_path);
    expect(out.geography_tier).toBe(SAMPLE_BRIEF.geography_tier);
  });
});

import { describe, expect, it } from "bun:test";
import type { PartialBriefState } from "@mizan/mastra/testing";
import { assertComputeVerificationPathInputs } from "@mizan/mastra/testing";

function baseState(overrides: Partial<PartialBriefState> = {}): PartialBriefState {
  return {
    caseId: "case-id",
    runId: "run-id",
    ...overrides,
  };
}

/**
 * Step-wrapper guards. `deriveVerificationPath` is intentionally
 * permissive (returns `none` on missing classify/vouching) so unit-test
 * callers can exercise the predicate without staging the full workflow
 * state. The step is strict — a refactor that reordered or skipped
 * `classifyCampaign` / `classifyVouchingChain` upstream would otherwise
 * silently route to `documentary` based on extractor evidence alone.
 */
describe("assertComputeVerificationPathInputs", () => {
  it("returns the classify slot when both classify and signals.vouching are present", () => {
    const state = baseState({
      classify: {
        category: "medical",
        verification_path: "documentary",
        geography_tier: "SAFE",
      },
      signals: {
        vouching: { structure: "none", weakest_link_narrative: "no chain" },
      },
    });
    const classify = assertComputeVerificationPathInputs(state);
    expect(classify.category).toBe("medical");
    expect(classify.geography_tier).toBe("SAFE");
  });

  it("throws when classify slot is missing — classifyCampaign must run first", () => {
    expect(() =>
      assertComputeVerificationPathInputs(
        baseState({
          signals: { vouching: { structure: "none", weakest_link_narrative: "no chain" } },
        }),
      ),
    ).toThrow(/classify missing.*classifyCampaign must run first/);
  });

  it("throws when signals.vouching is missing — classifyVouchingChain / mergeSignals must run first", () => {
    expect(() =>
      assertComputeVerificationPathInputs(
        baseState({
          classify: {
            category: "medical",
            verification_path: "documentary",
            geography_tier: "OFAC",
          },
        }),
      ),
    ).toThrow(/signals\.vouching missing.*classifyVouchingChain \/ mergeSignals must run first/);
  });

  it("throws when signals exists but vouching slot is missing (story / photo populated only)", () => {
    expect(() =>
      assertComputeVerificationPathInputs(
        baseState({
          classify: {
            category: "medical",
            verification_path: "documentary",
            geography_tier: "AT_RISK",
          },
          signals: {
            story: { named_entity_density: 0.4, template_match_score: 0.3, coherence_summary: "" },
          },
        }),
      ),
    ).toThrow(/signals\.vouching missing/);
  });
});

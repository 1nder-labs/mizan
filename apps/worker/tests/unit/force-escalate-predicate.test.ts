import { describe, expect, it } from "bun:test";
import { forceEscalate } from "@mizan/mastra";
import type { BriefPayload, GeographyTier, VerificationPath } from "@mizan/mastra";

const RECOMMENDATIONS: ReadonlyArray<BriefPayload["recommendation"]> = [
  "READY_FOR_REVIEW",
  "REQUEST_DOCS",
  "ESCALATE",
  "BLOCK",
];

const PATHS: ReadonlyArray<VerificationPath> = [
  "documentary",
  "institutional_vouching",
  "community_vouching",
  "none",
];

const TIERS: ReadonlyArray<GeographyTier> = ["SAFE", "AT_RISK", "OFAC_ADJACENT", "OFAC"];

/**
 * Specification of the cases where the gate MUST fire — derived from the
 * Phase 4 PRD predicate definition, not from the implementation.
 *
 * The gate fires when both:
 *   - recommendation is not already at-or-above ESCALATE, AND
 *   - one of the two path/tier predicate branches matches:
 *     A. verification_path = "none"               + tier ∈ {AT_RISK, OFAC_ADJACENT, OFAC}
 *     B. verification_path = "community_vouching" + tier = OFAC
 *
 * Branch B was added in pass-5 fixes to close the length-only
 * community-vouching corroboration bypass on full-sanctions OFAC
 * geographies. `assertCommunityVouchingCorroborated` only enforces a
 * 20-char floor, so the LLM-classified path has no token-grounding —
 * acceptable for AT_RISK / OFAC_ADJACENT per PRD §6 Phase 4 (case-006
 * Yemen relief stays REQUEST_DOCS), but a full-sanctions OFAC geography
 * (SD, SY, IR, etc.) cannot rely on that alone.
 */
const OVERRIDABLE_RECOMMENDATIONS: ReadonlySet<BriefPayload["recommendation"]> = new Set([
  "READY_FOR_REVIEW",
  "REQUEST_DOCS",
]);

const NO_PATH_ESCALATING_TIERS: ReadonlySet<GeographyTier> = new Set([
  "AT_RISK",
  "OFAC_ADJACENT",
  "OFAC",
]);

const COMMUNITY_VOUCHING_ESCALATING_TIERS: ReadonlySet<GeographyTier> = new Set(["OFAC"]);

interface TruthTableRow {
  readonly recommendation: BriefPayload["recommendation"];
  readonly verification_path: VerificationPath;
  readonly geography_tier: GeographyTier;
  readonly expected: boolean;
}

function expectedFromSpec(
  recommendation: BriefPayload["recommendation"],
  verification_path: VerificationPath,
  geography_tier: GeographyTier,
): boolean {
  if (!OVERRIDABLE_RECOMMENDATIONS.has(recommendation)) return false;
  if (verification_path === "none") {
    return NO_PATH_ESCALATING_TIERS.has(geography_tier);
  }
  if (verification_path === "community_vouching") {
    return COMMUNITY_VOUCHING_ESCALATING_TIERS.has(geography_tier);
  }
  return false;
}

const TRUTH_TABLE: ReadonlyArray<TruthTableRow> = RECOMMENDATIONS.flatMap((recommendation) =>
  PATHS.flatMap((verification_path) =>
    TIERS.map((geography_tier) => ({
      recommendation,
      verification_path,
      geography_tier,
      expected: expectedFromSpec(recommendation, verification_path, geography_tier),
    })),
  ),
);

describe("forceEscalate truth table", () => {
  it("covers every (recommendation, path, tier) combination", () => {
    expect(TRUTH_TABLE).toHaveLength(RECOMMENDATIONS.length * PATHS.length * TIERS.length);
  });

  it.each(TRUTH_TABLE.map((row) => [row] as const))(
    "%o",
    ({ recommendation, verification_path, geography_tier, expected }) => {
      expect(forceEscalate({ recommendation, verification_path, geography_tier })).toBe(expected);
    },
  );
});

describe("forceEscalate spec rules", () => {
  it("never fires when recommendation is already ESCALATE", () => {
    for (const tier of TIERS) {
      expect(
        forceEscalate({
          recommendation: "ESCALATE",
          verification_path: "none",
          geography_tier: tier,
        }),
      ).toBe(false);
    }
  });

  it("never fires when recommendation is BLOCK", () => {
    for (const tier of TIERS) {
      expect(
        forceEscalate({
          recommendation: "BLOCK",
          verification_path: "none",
          geography_tier: tier,
        }),
      ).toBe(false);
    }
  });

  it("never fires when verification_path is documentary or institutional regardless of tier", () => {
    for (const path of ["documentary", "institutional_vouching"] as const) {
      for (const tier of TIERS) {
        expect(
          forceEscalate({
            recommendation: "READY_FOR_REVIEW",
            verification_path: path,
            geography_tier: tier,
          }),
        ).toBe(false);
      }
    }
  });

  it("fires for community_vouching + OFAC (closes length-only corroboration bypass on full-sanctions geos)", () => {
    expect(
      forceEscalate({
        recommendation: "READY_FOR_REVIEW",
        verification_path: "community_vouching",
        geography_tier: "OFAC",
      }),
    ).toBe(true);
  });

  it("fires for community_vouching + OFAC even when recommendation is REQUEST_DOCS", () => {
    expect(
      forceEscalate({
        recommendation: "REQUEST_DOCS",
        verification_path: "community_vouching",
        geography_tier: "OFAC",
      }),
    ).toBe(true);
  });

  it("does NOT fire for community_vouching + OFAC_ADJACENT (PRD accepts community vouching at OFAC_ADJACENT — case-006 Yemen)", () => {
    expect(
      forceEscalate({
        recommendation: "REQUEST_DOCS",
        verification_path: "community_vouching",
        geography_tier: "OFAC_ADJACENT",
      }),
    ).toBe(false);
  });

  it("does NOT fire for community_vouching + AT_RISK", () => {
    expect(
      forceEscalate({
        recommendation: "READY_FOR_REVIEW",
        verification_path: "community_vouching",
        geography_tier: "AT_RISK",
      }),
    ).toBe(false);
  });

  it("does NOT fire for community_vouching + SAFE", () => {
    expect(
      forceEscalate({
        recommendation: "READY_FOR_REVIEW",
        verification_path: "community_vouching",
        geography_tier: "SAFE",
      }),
    ).toBe(false);
  });

  it("never fires when geography_tier is SAFE", () => {
    expect(
      forceEscalate({
        recommendation: "READY_FOR_REVIEW",
        verification_path: "none",
        geography_tier: "SAFE",
      }),
    ).toBe(false);
  });

  it("fires for READY_FOR_REVIEW + none + AT_RISK", () => {
    expect(
      forceEscalate({
        recommendation: "READY_FOR_REVIEW",
        verification_path: "none",
        geography_tier: "AT_RISK",
      }),
    ).toBe(true);
  });

  it("fires for REQUEST_DOCS + none + OFAC_ADJACENT", () => {
    expect(
      forceEscalate({
        recommendation: "REQUEST_DOCS",
        verification_path: "none",
        geography_tier: "OFAC_ADJACENT",
      }),
    ).toBe(true);
  });

  it("fires for READY_FOR_REVIEW + none + OFAC", () => {
    expect(
      forceEscalate({
        recommendation: "READY_FOR_REVIEW",
        verification_path: "none",
        geography_tier: "OFAC",
      }),
    ).toBe(true);
  });
});

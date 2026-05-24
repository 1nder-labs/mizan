import { describe, expect, it } from "bun:test";
import { forceEscalate } from "@mizan/mastra";
import type { BriefPayload, GeographyTier, VerificationPath } from "@mizan/shared";

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
 * Specification of when the gate MUST fire — derived from the canonical
 * rule, not the implementation:
 *
 *   The gate fires when the recommendation is overridable AND the case
 *   is NOT auto-allowed. A case is auto-allowed iff:
 *
 *     - geography_tier === "SAFE", OR
 *     - verification_path === "documentary" AND geography_tier !== "OFAC"
 *
 * Everything else escalates. Vouching paths (community + institutional)
 * are AI-classified with organizer-controlled corroboration, so any
 * non-SAFE jurisdiction requires explicit human validation. Documentary
 * is the only AI-verifiable path; even there OFAC tier requires a
 * manual SDN-list cross-check.
 */
const OVERRIDABLE_RECOMMENDATIONS: ReadonlySet<BriefPayload["recommendation"]> = new Set([
  "READY_FOR_REVIEW",
  "REQUEST_DOCS",
]);

function isAutoAllowedSpec(path: VerificationPath, tier: GeographyTier): boolean {
  if (tier === "SAFE") return true;
  return path === "documentary" && tier !== "OFAC";
}

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
  return !isAutoAllowedSpec(verification_path, geography_tier);
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

  it("never fires for any path when geography_tier is SAFE", () => {
    for (const path of PATHS) {
      expect(
        forceEscalate({
          recommendation: "READY_FOR_REVIEW",
          verification_path: path,
          geography_tier: "SAFE",
        }),
      ).toBe(false);
    }
  });

  it("documentary path never fires on AT_RISK or OFAC_ADJACENT", () => {
    for (const tier of ["AT_RISK", "OFAC_ADJACENT"] as const) {
      expect(
        forceEscalate({
          recommendation: "READY_FOR_REVIEW",
          verification_path: "documentary",
          geography_tier: tier,
        }),
      ).toBe(false);
    }
  });

  it("documentary path fires on OFAC (manual SDN-list cross-check required)", () => {
    expect(
      forceEscalate({
        recommendation: "READY_FOR_REVIEW",
        verification_path: "documentary",
        geography_tier: "OFAC",
      }),
    ).toBe(true);
  });

  it("vouching paths fire on every non-SAFE tier", () => {
    const VOUCHING_PATHS = ["community_vouching", "institutional_vouching"] as const;
    const NON_SAFE_TIERS = ["AT_RISK", "OFAC_ADJACENT", "OFAC"] as const;
    for (const path of VOUCHING_PATHS) {
      for (const tier of NON_SAFE_TIERS) {
        expect(
          forceEscalate({
            recommendation: "READY_FOR_REVIEW",
            verification_path: path,
            geography_tier: tier,
          }),
        ).toBe(true);
      }
    }
  });

  it("none path fires on every non-SAFE tier", () => {
    const NON_SAFE_TIERS = ["AT_RISK", "OFAC_ADJACENT", "OFAC"] as const;
    for (const tier of NON_SAFE_TIERS) {
      expect(
        forceEscalate({
          recommendation: "READY_FOR_REVIEW",
          verification_path: "none",
          geography_tier: tier,
        }),
      ).toBe(true);
    }
  });
});

import { describe, expect, it } from "bun:test";
import { forceEscalate } from "@mizan/mastra";
import type { BriefPayload, GeographyTier, VerificationPath } from "@mizan/mastra";

const RECOMMENDATIONS: BriefPayload["recommendation"][] = [
  "READY_FOR_REVIEW",
  "REQUEST_DOCS",
  "ESCALATE",
  "BLOCK",
];

const PATHS: VerificationPath[] = [
  "documentary",
  "institutional_vouching",
  "community_vouching",
  "none",
];

const TIERS: GeographyTier[] = ["SAFE", "AT_RISK", "OFAC_ADJACENT", "OFAC"];

function expectedForce(
  recommendation: BriefPayload["recommendation"],
  verification_path: VerificationPath,
  geography_tier: GeographyTier,
): boolean {
  if (recommendation === "ESCALATE" || recommendation === "BLOCK") return false;
  if (verification_path !== "none") return false;
  return geography_tier === "OFAC_ADJACENT" || geography_tier === "OFAC";
}

const TRUTH_TABLE: Array<
  [BriefPayload["recommendation"], VerificationPath, GeographyTier, boolean]
> = [];

for (const recommendation of RECOMMENDATIONS) {
  for (const verification_path of PATHS) {
    for (const geography_tier of TIERS) {
      TRUTH_TABLE.push([
        recommendation,
        verification_path,
        geography_tier,
        expectedForce(recommendation, verification_path, geography_tier),
      ]);
    }
  }
}

describe("forceEscalate truth table", () => {
  it.each(TRUTH_TABLE)(
    "rec=%s path=%s tier=%s → %s",
    (recommendation, verification_path, geography_tier, expected) => {
      expect(
        forceEscalate({ recommendation, verification_path, geography_tier }),
      ).toBe(expected);
    },
  );
});

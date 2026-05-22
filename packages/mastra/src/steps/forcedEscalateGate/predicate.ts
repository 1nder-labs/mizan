import type { BriefPayload, GeographyTier, VerificationPath } from "../../schemas/brief.ts";

/** Returns true when the forced-escalate gate should override composeBrief output. */
export function forceEscalate(input: {
  recommendation: BriefPayload["recommendation"];
  verification_path: VerificationPath;
  geography_tier: GeographyTier;
}): boolean {
  const blockedRecommendations = input.recommendation === "ESCALATE" || input.recommendation === "BLOCK";
  if (blockedRecommendations) return false;
  if (input.verification_path !== "none") return false;
  return input.geography_tier === "OFAC_ADJACENT" || input.geography_tier === "OFAC";
}

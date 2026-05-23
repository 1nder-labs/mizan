import type { BriefPayload, GeographyTier, VerificationPath } from "@mizan/shared";

/**
 * Geography tiers that trigger the forced-escalate override when no
 * verification path is established. AT_RISK is included as defense-in-depth:
 * even without active sanctions, a case in a high-humanitarian-risk
 * jurisdiction without a documentary or vouching chain is an automatic
 * reviewer escalation, not a READY_FOR_REVIEW.
 */
const FORCE_ESCALATE_TIERS: ReadonlySet<GeographyTier> = new Set([
  "AT_RISK",
  "OFAC_ADJACENT",
  "OFAC",
]);

/** Recommendations that are already at-or-above ESCALATE; the gate is a no-op. */
const NON_OVERRIDABLE_RECOMMENDATIONS: ReadonlySet<BriefPayload["recommendation"]> = new Set([
  "ESCALATE",
  "BLOCK",
]);

/** Returns true when the forced-escalate gate should override composeBrief output. */
export function forceEscalate(input: {
  recommendation: BriefPayload["recommendation"];
  verification_path: VerificationPath;
  geography_tier: GeographyTier;
}): boolean {
  if (NON_OVERRIDABLE_RECOMMENDATIONS.has(input.recommendation)) return false;
  if (input.verification_path !== "none") return false;
  return FORCE_ESCALATE_TIERS.has(input.geography_tier);
}

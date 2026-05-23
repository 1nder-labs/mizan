import type { BriefPayload, GeographyTier, VerificationPath } from "@mizan/shared";

/**
 * Geography tiers that trigger the forced-escalate override when there
 * is no verification path at all. AT_RISK is included as defense in
 * depth: even without active sanctions, a case in a
 * high-humanitarian-risk jurisdiction with no documentary or vouching
 * chain is an automatic reviewer escalation, not READY_FOR_REVIEW.
 */
const FORCE_ESCALATE_NO_PATH_TIERS: ReadonlySet<GeographyTier> = new Set([
  "AT_RISK",
  "OFAC_ADJACENT",
  "OFAC",
]);

/**
 * Geography tiers that trigger the forced-escalate override when the
 * verification path is `community_vouching`. The community path is
 * corroborated by length-only narrative (see
 * `assertCommunityVouchingCorroborated`), so the LLM-classified
 * accountability chain has no token-grounding floor. On full-sanctions
 * OFAC geographies (SD, SY, IR, KP, BY, RU, CU) the residual
 * classification risk is too high to route without explicit human
 * validation of the chain.
 *
 * Narrower than the no-path tier set: OFAC_ADJACENT and AT_RISK
 * community-vouching are intentionally NOT escalated. PRD §6 Phase 4
 * accepts community vouching as sufficient evidence in those tiers
 * (case-006 Yemen REQUEST_DOCS path depends on this). Broadening this
 * predicate would require a PRD edit — flag the scope explicitly so a
 * future reviewer sees the carve-out instead of widening it by reflex.
 */
const FORCE_ESCALATE_COMMUNITY_VOUCHING_TIERS: ReadonlySet<GeographyTier> = new Set(["OFAC"]);

/** Recommendations that are already at-or-above ESCALATE; the gate is a no-op. */
const NON_OVERRIDABLE_RECOMMENDATIONS: ReadonlySet<BriefPayload["recommendation"]> = new Set([
  "ESCALATE",
  "BLOCK",
]);

/**
 * Returns true when the forced-escalate gate should override
 * composeBrief output. Fires on two predicates:
 *
 *   1. verification_path = "none" AND tier ∈ {AT_RISK, OFAC_ADJACENT, OFAC}
 *   2. verification_path = "community_vouching" AND tier = OFAC
 *
 * `forced_escalate_reason` carries the predicate that fired so the
 * reviewer brief explains *why* the gate triggered.
 */
export function forceEscalate(input: {
  recommendation: BriefPayload["recommendation"];
  verification_path: VerificationPath;
  geography_tier: GeographyTier;
}): boolean {
  if (NON_OVERRIDABLE_RECOMMENDATIONS.has(input.recommendation)) return false;
  if (input.verification_path === "none") {
    return FORCE_ESCALATE_NO_PATH_TIERS.has(input.geography_tier);
  }
  if (input.verification_path === "community_vouching") {
    return FORCE_ESCALATE_COMMUNITY_VOUCHING_TIERS.has(input.geography_tier);
  }
  return false;
}

/**
 * Builds the human-readable reason string for the forced-escalate
 * brief field. The reason names the predicate branch that fired so the
 * reviewer can audit the override without re-running the predicate.
 */
export function forcedEscalateReason(input: {
  verification_path: VerificationPath;
  geography_tier: GeographyTier;
  geography: string;
}): string {
  if (input.verification_path === "community_vouching") {
    return (
      `verification_path=community_vouching + geography_tier=${input.geography_tier} ` +
      `(case in ${input.geography}: community vouching insufficient for high-risk jurisdiction)`
    );
  }
  return (
    `verification_path=${input.verification_path} + geography_tier=${input.geography_tier} ` +
    `(case in ${input.geography}: no documentary chain, high-risk jurisdiction)`
  );
}

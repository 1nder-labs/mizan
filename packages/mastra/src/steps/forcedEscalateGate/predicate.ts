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
 * verification path is `community_vouching` OR `institutional_vouching`.
 *
 * Both paths are corroborated by application-side guards that are
 * structurally circular against an adversarial LLM:
 *
 *   - community_vouching: `assertCommunityVouchingCorroborated` only
 *     enforces a 20-char vouching_narrative length floor; a generic
 *     platitude passes.
 *   - institutional_vouching: `assertPartnerOrgCorroborated` cross-
 *     references the LLM-emitted `partner_org_name` against the same
 *     organizer-controlled `vouching_narrative` — the attacker can
 *     write the name they want extracted into the narrative and the
 *     guard signs off. The needle floor (4 alphanumeric chars) admits
 *     common humanitarian-prose words ("CARE", "ECHO", "SAVE").
 *
 * On full-sanctions OFAC geographies (SD, SY, IR, KP, BY, RU, CU) the
 * residual classification risk on either path is too high to route
 * without explicit human validation, including OFAC SDN-list cross-
 * checks the AI cannot perform.
 *
 * Narrower than the no-path tier set: OFAC_ADJACENT and AT_RISK
 * community / institutional vouching are NOT escalated — PRD §6
 * Phase 4 accepts both paths as sufficient evidence in those tiers
 * (case-006 Yemen REQUEST_DOCS path depends on this). The carve-out
 * is intentional; broadening it would require a PRD edit.
 */
const FORCE_ESCALATE_VOUCHING_TIERS: ReadonlySet<GeographyTier> = new Set(["OFAC"]);

/** Recommendations that are already at-or-above ESCALATE; the gate is a no-op. */
const NON_OVERRIDABLE_RECOMMENDATIONS: ReadonlySet<BriefPayload["recommendation"]> = new Set([
  "ESCALATE",
  "BLOCK",
]);

/**
 * Returns true when the forced-escalate gate should override
 * composeBrief output. Fires on three predicates:
 *
 *   1. verification_path = "none"                  AND tier ∈ {AT_RISK, OFAC_ADJACENT, OFAC}
 *   2. verification_path = "community_vouching"    AND tier = OFAC
 *   3. verification_path = "institutional_vouching" AND tier = OFAC
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
  if (
    input.verification_path === "community_vouching" ||
    input.verification_path === "institutional_vouching"
  ) {
    return FORCE_ESCALATE_VOUCHING_TIERS.has(input.geography_tier);
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
      `(case in ${input.geography}: community vouching insufficient for full-sanctions jurisdiction)`
    );
  }
  if (input.verification_path === "institutional_vouching") {
    return (
      `verification_path=institutional_vouching + geography_tier=${input.geography_tier} ` +
      `(case in ${input.geography}: institutional vouching insufficient for full-sanctions jurisdiction — requires manual OFAC SDN check)`
    );
  }
  return (
    `verification_path=${input.verification_path} + geography_tier=${input.geography_tier} ` +
    `(case in ${input.geography}: no documentary chain, high-risk jurisdiction)`
  );
}

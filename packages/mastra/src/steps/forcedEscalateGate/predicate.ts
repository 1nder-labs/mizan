import type { BriefPayload, GeographyTier, VerificationPath } from "@mizan/shared";

/**
 * Single canonical rule for when AI cannot fully verify a high-risk
 * case on its own. The gate fires whenever a case is NOT auto-allowed.
 *
 * Auto-allowed iff:
 *   - `geography_tier === "SAFE"`, OR
 *   - `verification_path === "documentary"` AND `geography_tier !== "OFAC"`
 *
 * Everything else escalates. Truth table (rows = path, columns = tier):
 *
 *   | path                    | SAFE | AT_RISK | OFAC_ADJACENT | OFAC |
 *   |-------------------------|------|---------|---------------|------|
 *   | documentary             |  no  |   no    |      no       | YES  |
 *   | institutional_vouching  |  no  |  YES    |     YES       | YES  |
 *   | community_vouching      |  no  |  YES    |     YES       | YES  |
 *   | none                    |  no  |  YES    |     YES       | YES  |
 *
 * Why this shape:
 *
 *   - Vouching paths (community + institutional) are corroborated by
 *     organizer-controlled narrative; the application guards are
 *     structurally circular against an adversarial LLM. Any non-SAFE
 *     geography requires explicit human validation of the chain.
 *   - Documentary is the only AI-verifiable path (high-confidence
 *     extractors over real evidence). Even there, OFAC tier still
 *     requires manual SDN-list cross-check the AI cannot perform.
 *   - `none` always escalates on non-SAFE tiers — no verification
 *     evidence whatsoever to act on.
 */
function isAutoAllowed(path: VerificationPath, tier: GeographyTier): boolean {
  if (tier === "SAFE") return true;
  return path === "documentary" && tier !== "OFAC";
}

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
  return !isAutoAllowed(input.verification_path, input.geography_tier);
}

/**
 * Reviewer-facing one-liner explaining why the gate fired. Data-driven
 * lookup over (verification_path, geography_tier) keeps the wording in
 * one table — drift between `forceEscalate` and this function would
 * otherwise be invisible until a reviewer reads a stale message.
 */
const REASON_BY_PATH: Readonly<Record<VerificationPath, string>> = {
  documentary: "documentary evidence still requires manual OFAC SDN check at full-sanctions tier",
  institutional_vouching:
    "no documentary verification path; trust = vouching strength — institutional vouching insufficient for non-SAFE jurisdiction (partner-org corroboration is organizer-supplied)",
  community_vouching:
    "no documentary verification path; trust = vouching strength — community vouching insufficient for non-SAFE jurisdiction (narrative corroboration is organizer-supplied)",
  none: "no documentary verification path; trust = vouching strength — no vouching chain available, high-risk jurisdiction",
};

/**
 * Builds the human-readable reason string written to
 * `brief.forced_escalate_reason`. Renders the (path, tier, geography)
 * tuple plus a path-specific explanation.
 */
export function forcedEscalateReason(input: {
  verification_path: VerificationPath;
  geography_tier: GeographyTier;
  geography: string;
}): string {
  return (
    `verification_path=${input.verification_path} + geography_tier=${input.geography_tier} ` +
    `(case in ${input.geography}: ${REASON_BY_PATH[input.verification_path]})`
  );
}

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
 * Reviewer-facing explanation for why the gate fired, written in plain
 * language for a non-technical Trust & Safety reviewer — no internal field
 * names (`verification_path=…`, `geography_tier=…`). Data-driven lookup over
 * `verification_path` keeps the wording in one table so it can't drift from
 * `forceEscalate`'s decision.
 */
const REASON_BY_PATH: Readonly<Record<VerificationPath, string>> = {
  documentary:
    "This case has documentary evidence, but it's in a sanctioned jurisdiction — a reviewer still needs to run the manual sanctions-list (SDN) check the AI can't perform.",
  institutional_vouching:
    "There's no documentary evidence here. Trust rests on an institutional vouch from a partner organization, which the organizer supplied — so in a higher-risk jurisdiction a reviewer needs to confirm that vouch independently.",
  community_vouching:
    "There's no documentary evidence here. Trust rests on community vouching, which the organizer supplied — so in a higher-risk jurisdiction a reviewer needs to confirm the vouching chain independently.",
  none: "There's no verification evidence on this case at all, and it's in a higher-risk jurisdiction — it needs a human decision before anything proceeds.",
};

/** Plain-language phrasing for each geography risk tier. */
const TIER_PHRASE: Readonly<Record<GeographyTier, string>> = {
  SAFE: "a safe jurisdiction",
  AT_RISK: "an at-risk jurisdiction",
  OFAC_ADJACENT: "an OFAC-adjacent jurisdiction",
  OFAC: "an OFAC-sanctioned jurisdiction",
};

/**
 * Builds the human-readable reason written to `brief.forced_escalate_reason`:
 * a path-specific explanation followed by the case location and risk tier in
 * plain words.
 */
export function forcedEscalateReason(input: {
  verification_path: VerificationPath;
  geography_tier: GeographyTier;
  geography: string;
}): string {
  return `${REASON_BY_PATH[input.verification_path]} Location: ${input.geography} — ${TIER_PHRASE[input.geography_tier]}.`;
}

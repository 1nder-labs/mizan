/**
 * Single source for human-readable labels of enum values surfaced to
 * reviewers. Centralising here prevents label drift between queue
 * columns, case detail summary, and any future surface that renders
 * the same enum (`verification_path`, `geography_tier`,
 * `recommendation`, `cases.status`).
 *
 * Add new label maps here when a new enum surfaces — never inline.
 */
import {
  countryName,
  type CaseStatus,
  type GeographyTier,
  type VerificationPath,
} from "@mizan/shared";

/** "Pakistan (PK)" — full country name with its code, or just the code if unknown. */
export function formatCountry(code: string): string {
  const name = countryName(code);
  return name === code ? code : `${name} (${code})`;
}

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  DRAFT: "Draft",
  QUEUED: "Queued",
  RUNNING: "Running",
  SUSPENDED_HITL: "Awaiting reviewer",
  READY_FOR_REVIEW: "Ready",
  ACTIONED: "Actioned",
  FAILED: "Failed",
};

export const VERIFICATION_LABEL: Record<VerificationPath, string> = {
  documentary: "Documentary evidence",
  institutional_vouching: "Institutional vouching",
  community_vouching: "Community vouching",
  none: "None on file",
};

export const GEOGRAPHY_TIER_LABEL: Record<GeographyTier, string> = {
  SAFE: "Safe jurisdiction",
  AT_RISK: "At-risk jurisdiction",
  OFAC_ADJACENT: "OFAC-adjacent",
  OFAC: "OFAC-sanctioned",
};

export function humanVerification(path: VerificationPath): string {
  return VERIFICATION_LABEL[path] ?? path;
}

export function humanGeography(tier: GeographyTier): string {
  return GEOGRAPHY_TIER_LABEL[tier] ?? tier;
}

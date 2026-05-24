import type { GeographyTier } from "@mizan/shared";

/**
 * ISO-3166 alpha-2 to OFAC / risk tier lookup.
 *
 * - `OFAC`: full comprehensive sanctions program in effect
 *   (1997 SSOMA for Sudan, EO 14038 BELA for Belarus, etc.).
 * - `OFAC_ADJACENT`: partial sanctions, regional risk overlap, or
 *   humanitarian corridors that require enhanced due diligence.
 * - `AT_RISK`: high humanitarian or verification risk per LaunchGood policy.
 * - `SAFE`: explicitly whitelisted low-risk jurisdiction.
 *
 * Unknown / unmapped codes intentionally default to `OFAC_ADJACENT`
 * (fail-safe), not `SAFE` — a typo'd geography code must not coerce a
 * high-risk case onto the auto-allowed path. The empty-string case
 * collapses to `OFAC_ADJACENT` for the same reason. Operators expand
 * `COUNTRY_TIER` explicitly when a new geography is onboarded.
 *
 * Update reference: https://ofac.treasury.gov/sanctions-programs-and-country-information
 */
const SAFE_COUNTRIES: ReadonlySet<string> = new Set([
  "US",
  "CA",
  "GB",
  "AU",
  "NZ",
  "DE",
  "FR",
  "NL",
  "SE",
  "NO",
  "DK",
  "FI",
  "IE",
  "ES",
  "IT",
  "PT",
  "AT",
  "BE",
  "CH",
  "JP",
  "SG",
  "MY",
  "ID",
  "AE",
  "QA",
  "KW",
  "SA",
  "TR",
  "EG",
  "JO",
  "MA",
  "TN",
  "ZA",
  "KE",
  "GH",
  "NG",
  "PK",
  "BD",
  "IN",
  "PH",
]);

const COUNTRY_TIER: Readonly<Record<string, GeographyTier>> = {
  BY: "OFAC",
  CU: "OFAC",
  IR: "OFAC",
  KP: "OFAC",
  RU: "OFAC",
  SD: "OFAC",
  SY: "OFAC",
  AF: "OFAC_ADJACENT",
  IQ: "OFAC_ADJACENT",
  LB: "OFAC_ADJACENT",
  LY: "OFAC_ADJACENT",
  MM: "OFAC_ADJACENT",
  PS: "OFAC_ADJACENT",
  VE: "OFAC_ADJACENT",
  YE: "OFAC_ADJACENT",
  ET: "AT_RISK",
  GA: "AT_RISK",
  ML: "AT_RISK",
  NE: "AT_RISK",
  SO: "AT_RISK",
};

/**
 * Maps a case geography code to its risk tier.
 *
 * Lookup order: explicit SAFE allowlist → explicit risk map → fail-safe
 * default of `OFAC_ADJACENT`. The fail-safe is deliberate: an
 * unrecognised, typo'd, or empty geography code routes through the
 * forced-escalate gate instead of slipping through on the auto-allowed
 * SAFE branch.
 */
export function tierFor(geography: string): GeographyTier {
  const code = geography.trim().toUpperCase();
  if (SAFE_COUNTRIES.has(code)) return "SAFE";
  return COUNTRY_TIER[code] ?? "OFAC_ADJACENT";
}

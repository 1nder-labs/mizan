import type { GeographyTier } from "@mizan/shared";

/*
 * ISO-3166 alpha-2 to OFAC / risk tier lookup.
 *
 * OFAC: full comprehensive sanctions program in effect (1997 SSOMA for Sudan,
 *   EO 14038 BELA for Belarus, etc.).
 * OFAC_ADJACENT: partial sanctions, regional risk overlap, or humanitarian
 *   corridors that require enhanced due diligence.
 * AT_RISK: high humanitarian or verification risk per LaunchGood policy.
 * SAFE: default for unknown or unmapped codes.
 *
 * Update reference: https://ofac.treasury.gov/sanctions-programs-and-country-information
 */
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
 * Trims and uppercases input; unknown codes return `SAFE`.
 */
export function tierFor(geography: string): GeographyTier {
  const code = geography.trim().toUpperCase();
  if (code.length === 0) return "SAFE";
  return COUNTRY_TIER[code] ?? "SAFE";
}

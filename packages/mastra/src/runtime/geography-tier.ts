/** External regulatory geography risk tier (UPPERCASE taxonomy). */
export type Tier = "SAFE" | "AT_RISK" | "OFAC_ADJACENT" | "OFAC";

/**
 * ISO-3166 alpha-2 → tier lookup.
 * Unknown or blank codes fall back to `SAFE`.
 */
const COUNTRY_TIER: Readonly<Record<string, Tier>> = {
  /** Full OFAC sanctions jurisdictions. */
  CU: "OFAC",
  IR: "OFAC",
  KP: "OFAC",
  RU: "OFAC",
  SY: "OFAC",

  /** Regional risk + sanctions overlap (humanitarian corridors, partial sanctions). */
  AF: "OFAC_ADJACENT",
  IQ: "OFAC_ADJACENT",
  LB: "OFAC_ADJACENT",
  LY: "OFAC_ADJACENT",
  MM: "OFAC_ADJACENT",
  PS: "OFAC_ADJACENT",
  SD: "OFAC_ADJACENT",
  VE: "OFAC_ADJACENT",
  YE: "OFAC_ADJACENT",

  /** High humanitarian / verification risk per LaunchGood enhanced-due-diligence pattern. */
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
export function tierFor(geography: string): Tier {
  const code = geography.trim().toUpperCase();
  if (code.length === 0) return "SAFE";
  return COUNTRY_TIER[code] ?? "SAFE";
}

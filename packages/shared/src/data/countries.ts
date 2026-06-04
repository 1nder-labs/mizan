/**
 * Canonical country list for the portal geography picker, derived from the
 * ISO 3166-1 alpha-2 codes with names resolved via `Intl.DisplayNames`. The
 * stored `geography` value is the 2-letter CODE (matching the existing seed
 * cases, which use codes like "EG"); the name is for display + search only.
 *
 * `COUNTRY_CODE_SET` is the single source the `CampaignCreateSchema.geography`
 * refinement validates against, so a hand-crafted request can't slip a value
 * that isn't a real country past the server.
 */
const ISO_3166_ALPHA2 =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export interface Country {
  readonly code: string;
  readonly name: string;
}

export const COUNTRIES: ReadonlyArray<Country> = ISO_3166_ALPHA2.map((code) => ({
  code,
  name: regionNames.of(code) ?? code,
}))
  .filter((c) => c.name !== c.code)
  .sort((a, b) => a.name.localeCompare(b.name));

export const COUNTRY_CODE_SET: ReadonlySet<string> = new Set(COUNTRIES.map((c) => c.code));

const FLAG_OFFSET = 0x1f1e6 - "A".charCodeAt(0);

/** Emoji flag for a 2-letter country code (regional-indicator pair), or "". */
export function countryFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  const upper = code.toUpperCase();
  return String.fromCodePoint(upper.charCodeAt(0) + FLAG_OFFSET, upper.charCodeAt(1) + FLAG_OFFSET);
}

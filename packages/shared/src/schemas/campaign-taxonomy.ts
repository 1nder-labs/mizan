import { z } from "zod";

/**
 * Centralized campaign-intake taxonomy: the closed sets a portal client may
 * pick from, so the form renders dropdowns and the server rejects anything off
 * the list. `*_OPTIONS` carry the `{ value, label }` the UI renders; the enums
 * (derived from those same values) are the validation contract.
 *
 * Reviewer-side schemas keep `category`/`claimed_zakat_category` as free strings
 * (seed cases predate this list), so this only constrains the portal create/edit
 * path — never existing internal data.
 */

export interface TaxonomyOption {
  readonly value: string;
  readonly label: string;
}

/** Fundraising campaign categories. */
export const CAMPAIGN_CATEGORY_OPTIONS = [
  { value: "emergency_relief", label: "Emergency relief" },
  { value: "disaster_relief", label: "Disaster relief" },
  { value: "medical", label: "Medical aid" },
  { value: "food_security", label: "Food & water" },
  { value: "refugee_support", label: "Refugee & displacement support" },
  { value: "orphan_care", label: "Orphan & widow care" },
  { value: "education", label: "Education" },
  { value: "shelter", label: "Shelter & housing" },
  { value: "livelihood", label: "Livelihood & income" },
  { value: "debt_relief", label: "Debt relief" },
  { value: "masjid", label: "Masjid & community" },
  { value: "other", label: "Other" },
] as const satisfies readonly TaxonomyOption[];

export const CampaignCategoryEnum = z.enum([
  "emergency_relief",
  "disaster_relief",
  "medical",
  "food_security",
  "refugee_support",
  "orphan_care",
  "education",
  "shelter",
  "livelihood",
  "debt_relief",
  "masjid",
  "other",
]);
export type CampaignCategory = z.infer<typeof CampaignCategoryEnum>;

/**
 * The eight canonical Zakat-eligible categories (asnaf) of Surah at-Tawbah 9:60.
 * The label pairs the transliterated term with a plain-language gloss so a
 * non-specialist organizer can still self-classify.
 */
export const ZAKAT_CATEGORY_OPTIONS = [
  { value: "fuqara", label: "Fuqara — the poor" },
  { value: "masakin", label: "Masakin — the needy" },
  { value: "amilin", label: "Amilin — Zakat administrators" },
  { value: "muallafah", label: "Muallafah — reconciliation of hearts" },
  { value: "riqab", label: "Riqab — freeing captives / bonded labour" },
  { value: "gharimin", label: "Gharimin — those in debt" },
  { value: "fi_sabilillah", label: "Fi sabilillah — in the cause of Allah" },
  { value: "ibn_sabil", label: "Ibn as-sabil — the stranded traveller" },
] as const satisfies readonly TaxonomyOption[];

export const ZakatCategoryEnum = z.enum([
  "fuqara",
  "masakin",
  "amilin",
  "muallafah",
  "riqab",
  "gharimin",
  "fi_sabilillah",
  "ibn_sabil",
]);
export type ZakatCategory = z.infer<typeof ZakatCategoryEnum>;

import { z } from "zod";

/**
 * Vouching-chain classification.
 *
 * Cross-provider strict-mode (OpenAI + Anthropic 2026-04-30) requires
 * top-level `type: "object"` and rejects top-level `anyOf` / `oneOf`.
 * We wrap the four discriminated variants in an object root under
 * `chain`. The variant union uses `z.union` (emits `anyOf`, accepted
 * inside properties; `z.discriminatedUnion` would emit `oneOf` which
 * OpenAI strict mode rejects).
 *
 * String length constraints live in `.describe()` rather than as
 * `minLength` / `maxLength` keywords — Anthropic strict mode rejects
 * those keywords. The application-side guards below (executed after
 * Zod parse) enforce the security-critical invariants.
 */

const NoneVariant = z
  .object({
    structure: z.literal("none"),
    weakest_link_narrative: z.string().describe("Plain text. Max 2000 characters."),
  })
  .strict();

const IndividualToIndividualVariant = z
  .object({
    structure: z.literal("individual-to-individual"),
    weakest_link_narrative: z.string().describe("Plain text. Max 2000 characters."),
  })
  .strict();

const IndividualViaPartnerOrgVariant = z
  .object({
    structure: z.literal("individual-via-partner-org"),
    partner_org_name: z
      .string()
      .describe("Non-empty institution name copied from the campaign data. Max 200 characters."),
    weakest_link_narrative: z.string().describe("Plain text. Max 2000 characters."),
  })
  .strict();

const OrgDirectVariant = z
  .object({
    structure: z.literal("org-direct"),
    partner_org_name: z
      .string()
      .describe("Non-empty institution name copied from the campaign data. Max 200 characters."),
    weakest_link_narrative: z.string().describe("Plain text. Max 2000 characters."),
  })
  .strict();

export const VouchingChainVariantSchema = z.union([
  NoneVariant,
  IndividualToIndividualVariant,
  IndividualViaPartnerOrgVariant,
  OrgDirectVariant,
]);

/**
 * LLM-output root schema. The variant lives under `chain` so the top
 * level stays a single object — required for cross-provider strict
 * mode. Consumers access `output.chain.structure` for narrowing.
 */
export const VouchingChainEnvelopeSchema = z
  .object({
    chain: VouchingChainVariantSchema,
  })
  .strict();

/**
 * Persisted shape for the `signals.vouching` slot — the variant
 * directly (no envelope). The envelope lives only on the LLM-output
 * wire (see `VouchingChainEnvelopeSchema`); persisted state stores
 * the variant so downstream readers keep accessing
 * `signals.vouching.structure` without an extra hop.
 */
export type VouchingChain = z.infer<typeof VouchingChainVariantSchema>;
export type VouchingChainEnvelope = z.infer<typeof VouchingChainEnvelopeSchema>;

/** Application-side guard for the security-critical empty-partner-name case. */
export function assertVouchingChain(chain: VouchingChain): VouchingChain {
  if (chain.structure === "individual-via-partner-org" || chain.structure === "org-direct") {
    if (chain.partner_org_name.trim().length === 0) {
      throw new Error(`vouching chain: empty partner_org_name for structure=${chain.structure}`);
    }
  }
  return chain;
}

const MIN_CORROBORATION_NEEDLE_CHARS = 4;
const MIN_INSTITUTIONAL_NARRATIVE_CHARS = 20;

/**
 * Normalises text for corroboration matching: lowercases, replaces every
 * non-alphanumeric character with a single space, collapses adjacent
 * whitespace, and trims. Punctuation, slashes, and hyphens cease to be
 * an attacker-controlled hiding place ("A.I.D" → "a i d").
 */
function normaliseForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

/**
 * Cross-references the LLM-emitted `partner_org_name` against the
 * organizer's `vouching_narrative` — specifically, NOT against the
 * free-form `story` field.
 *
 * Rules (applied in order; first failure throws):
 *   1. `vouching_narrative` must be present and at least
 *      `MIN_INSTITUTIONAL_NARRATIVE_CHARS` characters after trim.
 *   2. `partner_org_name` must be at least
 *      `MIN_CORROBORATION_NEEDLE_CHARS` alphanumeric characters.
 *   3. The normalised partner name must appear as a whole-word
 *      substring of the normalised narrative.
 */
export function assertPartnerOrgCorroborated(
  chain: VouchingChain,
  source: { readonly story: string; readonly vouching_narrative: string | null },
): VouchingChain {
  if (chain.structure !== "individual-via-partner-org" && chain.structure !== "org-direct") {
    return chain;
  }
  const narrative = (source.vouching_narrative ?? "").trim();
  if (narrative.length < MIN_INSTITUTIONAL_NARRATIVE_CHARS) {
    throw new Error(
      `vouching chain: ${chain.structure} requires a vouching_narrative of at least ${MIN_INSTITUTIONAL_NARRATIVE_CHARS} characters; received ${narrative.length} — story-only mentions do not corroborate an accountability chain`,
    );
  }
  const needle = normaliseForMatch(chain.partner_org_name);
  if (needle.replace(/\s+/gu, "").length < MIN_CORROBORATION_NEEDLE_CHARS) {
    throw new Error(
      `vouching chain: partner_org_name "${chain.partner_org_name}" is too short to corroborate (min ${MIN_CORROBORATION_NEEDLE_CHARS} alphanumeric chars)`,
    );
  }
  const haystack = ` ${normaliseForMatch(narrative)} `;
  if (!haystack.includes(` ${needle} `)) {
    throw new Error(
      `vouching chain: partner_org_name "${chain.partner_org_name}" is not mentioned in vouching_narrative — refusing to route ${chain.structure}`,
    );
  }
  return chain;
}

const MIN_COMMUNITY_NARRATIVE_CHARS = 20;

/**
 * Cross-references a community-vouching classification against the
 * organizer-supplied `vouching_narrative`. A `structure === "individual-to-individual"`
 * claim needs `vouching_narrative` of at least `MIN_COMMUNITY_NARRATIVE_CHARS`
 * characters after trim. Other structures pass through unchanged.
 */
export function assertCommunityVouchingCorroborated(
  chain: VouchingChain,
  source: { readonly vouching_narrative: string | null },
): VouchingChain {
  if (chain.structure !== "individual-to-individual") return chain;
  const narrative = (source.vouching_narrative ?? "").trim();
  if (narrative.length < MIN_COMMUNITY_NARRATIVE_CHARS) {
    throw new Error(
      `vouching chain: community-vouching path requires a vouching_narrative of at least ${MIN_COMMUNITY_NARRATIVE_CHARS} characters; received ${narrative.length}`,
    );
  }
  return chain;
}

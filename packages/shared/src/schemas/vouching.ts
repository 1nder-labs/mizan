import { z } from "zod";

/**
 * Vouching-chain classification output.
 *
 * Uses `z.union` (not `z.discriminatedUnion`) so the emitted JSON Schema
 * is `anyOf` rather than `oneOf` — Anthropic + OpenAI structured-output
 * strict modes accept `anyOf` across providers, but neither accepts
 * `oneOf`. TypeScript narrowing on the `structure` literal still works
 * at the call site (`if (chain.structure === "individual-via-partner-org")`).
 *
 * String length constraints live in the LLM's instructional prompt via
 * `.describe()` rather than as `minLength`/`maxLength` keywords, which
 * Anthropic's strict mode rejects. The step layer post-validates
 * `partner_org_name` non-emptiness because empty strings would bypass
 * the forced-escalate gate.
 */
export const VouchingChainSchema = z.union([
  z
    .object({
      structure: z.literal("none"),
      weakest_link_narrative: z.string().describe("Plain text. Max 2000 characters."),
    })
    .strict(),
  z
    .object({
      structure: z.literal("individual-to-individual"),
      weakest_link_narrative: z.string().describe("Plain text. Max 2000 characters."),
    })
    .strict(),
  z
    .object({
      structure: z.literal("individual-via-partner-org"),
      partner_org_name: z
        .string()
        .describe("Non-empty institution name copied from the campaign data. Max 200 characters."),
      weakest_link_narrative: z.string().describe("Plain text. Max 2000 characters."),
    })
    .strict(),
  z
    .object({
      structure: z.literal("org-direct"),
      partner_org_name: z
        .string()
        .describe("Non-empty institution name copied from the campaign data. Max 200 characters."),
      weakest_link_narrative: z.string().describe("Plain text. Max 2000 characters."),
    })
    .strict(),
]);

export type VouchingChain = z.infer<typeof VouchingChainSchema>;

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
 * organizer-supplied source text. If the partner isn't mentioned in the
 * story or vouching_narrative, the LLM has fabricated an institution and
 * we must not route the case down the `institutional_vouching` path —
 * doing so would let a forced-escalate bypass succeed on adversarial
 * prompts that coax the classifier into emitting a hallucinated org name.
 *
 * Match is token-boundary aware: the needle and haystack are both
 * normalised to space-separated lowercase tokens, then the needle must
 * appear as a whole-word substring (`" needle "` against `" haystack "`).
 * That prevents short tokens like "Aid" from passing because they happen
 * to sit inside an unrelated word ("AIDS clinic"). A floor of 4
 * post-normalisation characters rejects single-letter / two-letter
 * "partner names" that could not reliably distinguish an org.
 */
export function assertPartnerOrgCorroborated(
  chain: VouchingChain,
  source: { readonly story: string; readonly vouching_narrative: string | null },
): VouchingChain {
  if (chain.structure !== "individual-via-partner-org" && chain.structure !== "org-direct") {
    return chain;
  }
  const needle = normaliseForMatch(chain.partner_org_name);
  if (needle.replace(/\s+/gu, "").length < MIN_CORROBORATION_NEEDLE_CHARS) {
    throw new Error(
      `vouching chain: partner_org_name "${chain.partner_org_name}" is too short to corroborate (min ${MIN_CORROBORATION_NEEDLE_CHARS} alphanumeric chars)`,
    );
  }
  const haystack = ` ${normaliseForMatch(`${source.story} ${source.vouching_narrative ?? ""}`)} `;
  if (!haystack.includes(` ${needle} `)) {
    throw new Error(
      `vouching chain: partner_org_name "${chain.partner_org_name}" is not corroborated in story or vouching_narrative — refusing to route ${chain.structure}`,
    );
  }
  return chain;
}

const MIN_COMMUNITY_NARRATIVE_CHARS = 20;

/**
 * Cross-references a community-vouching classification against the
 * organizer-supplied `vouching_narrative`.
 *
 * `structure === "individual-to-individual"` claims a peer accountability
 * chain; the LLM must have grounded that claim in non-empty source text
 * (otherwise a Gaza-style "no chain" case can be relabelled as
 * `community_vouching`, bypassing the forced-escalate gate). The check
 * requires a `vouching_narrative` of at least
 * `MIN_COMMUNITY_NARRATIVE_CHARS` post-trim characters.
 *
 * Other structures pass through unchanged.
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

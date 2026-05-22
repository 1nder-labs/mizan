import { z } from "zod";

/**
 * Vouching-chain classification output.
 *
 * Uses `z.union` (not `z.discriminatedUnion`) so the emitted JSON Schema is
 * `anyOf` rather than `oneOf` — Anthropic + OpenAI structured-output strict
 * modes accept `anyOf` across providers, but neither accepts `oneOf`.
 * TypeScript narrowing on the `structure` literal still works at the call
 * site (`if (chain.structure === "individual-via-partner-org")`).
 *
 * String length constraints live in the LLM's instructional prompt via
 * `.describe()` rather than as `minLength`/`maxLength` keywords, which
 * Anthropic's strict mode rejects. The step layer post-validates
 * `partner_org_name` non-emptiness because empty strings would bypass the
 * forced-escalate gate.
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

/**
 * Cross-references the LLM-emitted `partner_org_name` against the
 * organizer-supplied source text. If the partner isn't mentioned in the
 * story or vouching_narrative, the LLM has fabricated an institution and
 * we must not route the case down the `institutional_vouching` path —
 * doing so would let a forced-escalate bypass succeed on adversarial
 * prompts that coax the classifier into emitting a hallucinated org name.
 *
 * Returns the chain on success; throws on corroboration failure.
 */
export function assertPartnerOrgCorroborated(
  chain: VouchingChain,
  source: { readonly story: string; readonly vouching_narrative: string | null },
): VouchingChain {
  if (chain.structure !== "individual-via-partner-org" && chain.structure !== "org-direct") {
    return chain;
  }
  const haystack = `${source.story} ${source.vouching_narrative ?? ""}`.toLowerCase();
  const needle = chain.partner_org_name.toLowerCase();
  if (!haystack.includes(needle)) {
    throw new Error(
      `vouching chain: partner_org_name "${chain.partner_org_name}" is not corroborated in story or vouching_narrative — refusing to route ${chain.structure}`,
    );
  }
  return chain;
}

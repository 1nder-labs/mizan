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

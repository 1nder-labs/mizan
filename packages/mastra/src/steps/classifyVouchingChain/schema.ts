import { z } from "zod";

/** Vouching-chain classification output (discriminated by `structure`). */
export const VouchingChainSchema = z.discriminatedUnion("structure", [
  z.object({
    structure: z.literal("none"),
    weakest_link_narrative: z.string(),
  }),
  z.object({
    structure: z.literal("individual-to-individual"),
    weakest_link_narrative: z.string(),
  }),
  z.object({
    structure: z.literal("individual-via-partner-org"),
    partner_org_name: z.string(),
    weakest_link_narrative: z.string(),
  }),
  z.object({
    structure: z.literal("org-direct"),
    partner_org_name: z.string(),
    weakest_link_narrative: z.string(),
  }),
]);

export type VouchingChain = z.infer<typeof VouchingChainSchema>;

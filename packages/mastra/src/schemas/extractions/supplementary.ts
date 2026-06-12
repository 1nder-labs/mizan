import { z } from "zod";

/** One client-uploaded supplementary document, summarized by the vision LLM. */
const SupplementaryDocSchema = z.object({
  doc_type: z.string(),
  summary: z.string(),
  supports_campaign_claims: z.boolean(),
});

/**
 * Vision-LLM read of the client's supplementary (non-required) evidence. These
 * are the "additional documents" a client attaches beyond the three required
 * slots; this lets the brief SEE them instead of treating them as missing.
 * `documents` is empty when the client uploaded none.
 */
export const SupplementaryDocsSchema = z
  .object({
    documents: z.array(SupplementaryDocSchema),
  })
  .strict();

export type SupplementaryDocs = z.infer<typeof SupplementaryDocsSchema>;

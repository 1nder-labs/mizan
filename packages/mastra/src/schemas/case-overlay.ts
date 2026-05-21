import { z } from "zod";

/** Seed overlay persisted in `cases.brief_partial_json`. */
export const CaseOverlaySchema = z.object({
  story: z.string(),
  organizer_name: z.string(),
  r2_keys: z.object({
    creator_id: z.string(),
    bank_statement: z.string(),
    category_doc: z.string(),
  }),
});

export type CaseOverlay = z.infer<typeof CaseOverlaySchema>;

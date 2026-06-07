import { z } from "zod";

/**
 * Campaign narrative persisted in `cases.brief_partial_json`. Uploaded files
 * live in the `documents` table (single source of truth), NOT here — the
 * overlay carries only the human-authored campaign text.
 */
export const CaseOverlaySchema = z
  .object({
    story: z.string(),
    organizer_name: z.string(),
    vouching_narrative: z.string().optional(),
  })
  .strict();

export type CaseOverlay = z.infer<typeof CaseOverlaySchema>;

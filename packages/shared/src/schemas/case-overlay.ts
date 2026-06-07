import { z } from "zod";

/**
 * Campaign narrative persisted in `cases.brief_partial_json`. Uploaded files
 * live in the `documents` table (single source of truth), NOT here — the overlay
 * carries only the human-authored campaign text.
 *
 * Deliberately NOT `.strict()`: this schema also READS persisted JSON that may
 * carry a legacy key (e.g. a pre-`documents`-table `r2_keys`) or a field added
 * in a later version. Unknown keys are stripped rather than rejected, so an
 * evolving overlay never nukes the whole record — `story` + `organizer_name`
 * still validate and survive. Writers build the object from explicit literals,
 * so tolerance here costs no write-time safety while removing a silent
 * data-loss / brief-load-failure class on schema drift.
 */
export const CaseOverlaySchema = z.object({
  story: z.string(),
  organizer_name: z.string(),
  vouching_narrative: z.string().optional(),
});

export type CaseOverlay = z.infer<typeof CaseOverlaySchema>;

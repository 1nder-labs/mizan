import { z } from "zod";

/**
 * Identity OCR-match trust signal (`ocr_mismatch`). Surfaces whether the name on
 * the creator's government ID matches the claimed organizer (and bank-statement
 * holder).
 *
 * The VERDICT — `name_matches_organizer` — is the vision-LLM's semantic judgment
 * carried over from the ID extraction (`CreatorId.matches_organizer_name`). It is
 * the gate precisely because a character-distance metric false-flags the
 * transliteration (Mohammed / Muhammad / Mohamed), name-order, and dropped-
 * middle-name variance that pervades a global Muslim-charity platform. The
 * Jaro-Winkler `*_similarity` scores are SECONDARY detail for the reviewer — a
 * quantified surface-form closeness — and never gate the signal.
 */
export const OcrMismatchPayloadSchema = z
  .object({
    claimed_organizer_name: z.string(),
    id_full_name: z.string(),
    bank_account_holder_name: z.string().nullable(),
    name_matches_organizer: z.boolean(),
    id_organizer_similarity: z.number(),
    bank_organizer_similarity: z.number().nullable(),
    summary: z.string(),
  })
  .strict();

export type OcrMismatchPayload = z.infer<typeof OcrMismatchPayloadSchema>;

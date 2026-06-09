import { z } from "zod";

/**
 * Identity OCR-match trust signal (`ocr_mismatch`). Surfaces whether the name on
 * the creator's government ID — and the bank-statement holder — is the same
 * person as the claimed organizer.
 *
 * Both verdicts are the vision-LLM's SEMANTIC judgment carried over from the
 * extractions, each with a one-line reason. The signal deliberately carries no
 * character-distance score: a metric like Jaro-Winkler floors unrelated names
 * around 40–60% by shared letters (so "Omar Farouk" vs "David Thompson" reads as
 * a partial match) AND false-flags the transliteration / name-order / dropped-
 * middle-name variance that pervades a global Muslim-charity platform. The
 * model's identity judgment + rationale is the signal; the raw surface-form
 * number misled in both directions, so it is gone.
 */
export const OcrMismatchPayloadSchema = z
  .object({
    claimed_organizer_name: z.string(),
    id_full_name: z.string(),
    bank_account_holder_name: z.string().nullable(),
    name_matches_organizer: z.boolean(),
    id_match_reason: z.string(),
    bank_account_holder_matches: z.boolean().nullable(),
    bank_match_reason: z.string().nullable(),
    summary: z.string(),
  })
  .strict();

export type OcrMismatchPayload = z.infer<typeof OcrMismatchPayloadSchema>;

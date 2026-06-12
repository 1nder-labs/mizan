import { z } from "zod";
import { ImageAuthenticitySchema } from "@mizan/shared";

/** Structured fields extracted from the creator government-issued ID document. */
export const CreatorIdSchema = z.object({
  document_type: z.enum(["passport", "national_id", "drivers_license", "other"]),
  full_name: z.string(),
  document_number_redacted: z.string(),
  issuing_country_iso: z.string(),
  issue_date_iso: z.string().nullable(),
  expiry_date_iso: z.string().nullable(),
  matches_organizer_name: z.boolean(),
  /**
   * One-line semantic explanation of how the ID name relates to the claimed
   * organizer — e.g. "same person, romanized spelling variant" or "different
   * individual entirely". This is the reviewer-facing rationale behind
   * `matches_organizer_name`, replacing a meaningless character-distance score.
   */
  organizer_name_match_reason: z.string(),
  confidence: z.number(),
  /**
   * Image-authenticity read of the ID photo, produced by the SAME vision call
   * that extracts the fields above — the model already has the image in context.
   */
  image_authenticity: ImageAuthenticitySchema,
});

import { z } from "zod";

/** Structured fields extracted from the creator government-issued ID document. */
export const CreatorIdSchema = z.object({
  document_type: z.enum(["passport", "national_id", "drivers_license", "other"]),
  full_name: z.string(),
  document_number_redacted: z.string(),
  issuing_country_iso: z.string(),
  issue_date_iso: z.string().nullable(),
  expiry_date_iso: z.string().nullable(),
  matches_organizer_name: z.boolean(),
  confidence: z.number(),
});

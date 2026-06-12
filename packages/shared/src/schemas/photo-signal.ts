import { z } from "zod";

/** Risk level that a document image is fabricated / not a genuine original. */
export const AuthenticityRiskSchema = z.enum(["low", "medium", "high", "very_high"]);

/**
 * The vision LLM's authenticity read of one document image, emitted by the SAME
 * extractor call that already passes the image to the model — no separate vision
 * call. `authenticity_risk` is the overall likelihood the image is NOT a genuine
 * original, judged against what a real document OF THAT TYPE should look like —
 * so it spans AI/synthetic generation, template / placeholder / specimen
 * artifacts, and missing expected security features, not merely whether the
 * pixels are AI-made. `shows_tampering_signs` is the narrower question of
 * post-hoc edits to an otherwise-real document.
 */
export const ImageAuthenticitySchema = z
  .object({
    authenticity_risk: AuthenticityRiskSchema,
    shows_tampering_signs: z.boolean(),
    assessment: z.string(),
  })
  .strict();

/**
 * Real EXIF capture metadata parsed from the raw image bytes. Absent
 * (`has_capture_metadata: false`) for PDFs, screenshots, re-saved / scrubbed
 * photos, and AI-generated images — a genuine camera capture carries a make /
 * model / timestamp (and often GPS). Honestly reports absence rather than
 * inventing data.
 */
export const ExifSummarySchema = z
  .object({
    has_capture_metadata: z.boolean(),
    camera_make: z.string().nullable(),
    camera_model: z.string().nullable(),
    captured_at: z.string().nullable(),
    has_gps: z.boolean(),
  })
  .strict();

/** Per-document image-authenticity signal: the LLM's authenticity read + parsed EXIF. */
export const PhotoAssetSignalSchema = z
  .object({
    authenticity: ImageAuthenticitySchema,
    exif: ExifSummarySchema,
  })
  .strict();

/** Image-authenticity trust signal for the creator-ID + category-document images. */
export const PhotoSignalPayloadSchema = z
  .object({
    creator_id: PhotoAssetSignalSchema,
    category_doc: PhotoAssetSignalSchema,
  })
  .strict();

export type AuthenticityRisk = z.infer<typeof AuthenticityRiskSchema>;
export type ImageAuthenticity = z.infer<typeof ImageAuthenticitySchema>;
export type ExifSummary = z.infer<typeof ExifSummarySchema>;
export type PhotoAssetSignal = z.infer<typeof PhotoAssetSignalSchema>;
export type PhotoSignalPayload = z.infer<typeof PhotoSignalPayloadSchema>;

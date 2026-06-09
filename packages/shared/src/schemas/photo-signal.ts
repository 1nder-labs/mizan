import { z } from "zod";

/** Likelihood the document image was AI-generated, as judged by the vision LLM that read it. */
export const AiGeneratedLikelihoodSchema = z.enum(["low", "medium", "high", "very_high"]);

/**
 * The vision LLM's authenticity read of one document image. Emitted by the SAME
 * extractor call that already passes the image to the model — no separate vision
 * call. While extracting the document's structured fields the model also rates
 * how likely the image is AI-generated, whether it shows tampering / manipulation
 * signs, and gives a short rationale.
 */
export const ImageAuthenticitySchema = z
  .object({
    ai_generated_likelihood: AiGeneratedLikelihoodSchema,
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

export type AiGeneratedLikelihood = z.infer<typeof AiGeneratedLikelihoodSchema>;
export type ImageAuthenticity = z.infer<typeof ImageAuthenticitySchema>;
export type ExifSummary = z.infer<typeof ExifSummarySchema>;
export type PhotoAssetSignal = z.infer<typeof PhotoAssetSignalSchema>;
export type PhotoSignalPayload = z.infer<typeof PhotoSignalPayloadSchema>;

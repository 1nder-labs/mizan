import type { ExifSummary, ImageAuthenticity, PhotoSignalPayload } from "@mizan/shared";

/**
 * Authenticity fallback for the rare case where a document extraction degraded
 * and produced no read. The photo signal runs in the parallel branch AFTER the
 * extractors, so in practice the extraction is present; this keeps the step
 * total over the optional `extractions` state shape without silently inventing a
 * confident verdict.
 */
export const UNASSESSED_AUTHENTICITY: ImageAuthenticity = {
  ai_generated_likelihood: "low",
  shows_tampering_signs: false,
  assessment: "Image authenticity was not assessed — the document extraction was unavailable.",
};

/** Nests each image's authenticity read (from the vision extraction) + parsed EXIF into the payload. */
export function composePhotoSignalPayload(input: {
  readonly creatorAuthenticity: ImageAuthenticity;
  readonly creatorExif: ExifSummary;
  readonly categoryAuthenticity: ImageAuthenticity;
  readonly categoryExif: ExifSummary;
}): PhotoSignalPayload {
  return {
    creator_id: { authenticity: input.creatorAuthenticity, exif: input.creatorExif },
    category_doc: { authenticity: input.categoryAuthenticity, exif: input.categoryExif },
  };
}

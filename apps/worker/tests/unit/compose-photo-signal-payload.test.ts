import { describe, expect, it } from "bun:test";
import { composePhotoSignalPayload } from "@mizan/mastra/testing";

const AUTH_CLEAN = {
  authenticity_risk: "low" as const,
  shows_tampering_signs: false,
  assessment: "genuine document",
};
const AUTH_FLAG = {
  authenticity_risk: "very_high" as const,
  shows_tampering_signs: true,
  assessment: "appears generated",
};
const EXIF_NONE = {
  has_capture_metadata: false,
  camera_make: null,
  camera_model: null,
  captured_at: null,
  has_gps: false,
};
const EXIF_CAMERA = {
  has_capture_metadata: true,
  camera_make: "Canon",
  camera_model: "EOS R5",
  captured_at: "2026:05:01 10:00:00",
  has_gps: true,
};

/**
 * `composePhotoSignalPayload` is pure: a positional rearrangement of each
 * image's authenticity read + parsed EXIF into the persisted
 * `PhotoSignalPayload`. Pinning the mapping prevents a silent field-shuffle
 * where the creator-ID and category-document slots could cross-wire.
 */
describe("composePhotoSignalPayload", () => {
  it("places each authenticity + exif input in its expected slot", () => {
    const payload = composePhotoSignalPayload({
      creatorAuthenticity: AUTH_CLEAN,
      creatorExif: EXIF_CAMERA,
      categoryAuthenticity: AUTH_FLAG,
      categoryExif: EXIF_NONE,
    });
    expect(payload.creator_id.authenticity).toBe(AUTH_CLEAN);
    expect(payload.creator_id.exif).toBe(EXIF_CAMERA);
    expect(payload.category_doc.authenticity).toBe(AUTH_FLAG);
    expect(payload.category_doc.exif).toBe(EXIF_NONE);
  });

  it("does not cross-wire creator and category authenticity", () => {
    const payload = composePhotoSignalPayload({
      creatorAuthenticity: AUTH_FLAG,
      creatorExif: EXIF_NONE,
      categoryAuthenticity: AUTH_CLEAN,
      categoryExif: EXIF_NONE,
    });
    expect(payload.creator_id.authenticity.authenticity_risk).toBe("very_high");
    expect(payload.category_doc.authenticity.authenticity_risk).toBe("low");
  });

  it("does not cross-wire creator and category exif", () => {
    const payload = composePhotoSignalPayload({
      creatorAuthenticity: AUTH_CLEAN,
      creatorExif: EXIF_CAMERA,
      categoryAuthenticity: AUTH_CLEAN,
      categoryExif: EXIF_NONE,
    });
    expect(payload.creator_id.exif.has_capture_metadata).toBe(true);
    expect(payload.category_doc.exif.has_capture_metadata).toBe(false);
  });
});

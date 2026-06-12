import { describe, expect, it } from "bun:test";
import { parseExif } from "@mizan/mastra/testing";

/**
 * Minimal little-endian JPEG carrying an Exif APP1 with one IFD0 entry:
 * Make = "ACM" (4-byte ASCII, inline). Hand-built so the parser is exercised
 * end-to-end without a binary fixture file.
 */
function jpegWithMake(): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, 0x00, 0x22, // APP1, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF header: II, 42, IFD0 @ 8
    0x01, 0x00, // IFD0 entry count = 1
    0x0f, 0x01, 0x02, 0x00, 0x04, 0x00, 0x00, 0x00, 0x41, 0x43, 0x4d, 0x00, // Make(0x010F) ASCII[4] "ACM\0"
    0x00, 0x00, 0x00, 0x00, // next-IFD offset = 0
  ]);
}

describe("parseExif", () => {
  it("returns no capture metadata for empty / non-JPEG bytes", () => {
    expect(parseExif(new Uint8Array(0)).has_capture_metadata).toBe(false);
    expect(parseExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47])).has_capture_metadata).toBe(false);
    expect(parseExif(new Uint8Array([0x25, 0x50, 0x44, 0x46])).has_capture_metadata).toBe(false);
  });

  it("reads the camera make from a JPEG Exif APP1 segment", () => {
    const exif = parseExif(jpegWithMake());
    expect(exif.has_capture_metadata).toBe(true);
    expect(exif.camera_make).toBe("ACM");
    expect(exif.has_gps).toBe(false);
  });

  it("returns no metadata for a JPEG with no APP1 Exif segment", () => {
    expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])).has_capture_metadata).toBe(false);
  });
});

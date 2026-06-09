import { describe, expect, it } from "bun:test";
import {
  detectImageMediaType,
  isPdf,
  toDocumentPart,
  toFilePart,
  toImagePart,
} from "@mizan/mastra";

function bytesFrom(...prefix: ReadonlyArray<number>): Uint8Array {
  const padded = [...prefix, ...Array.from<number>({ length: 32 }).fill(0x00)];
  return Uint8Array.from(padded);
}

const PNG = bytesFrom(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytesFrom(0xff, 0xd8, 0xff);
const GIF87 = bytesFrom(0x47, 0x49, 0x46, 0x38, 0x37, 0x61);
const GIF89 = bytesFrom(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
const WEBP = bytesFrom(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);
const BMP = bytesFrom(0x42, 0x4d);
const PDF = bytesFrom(0x25, 0x50, 0x44, 0x46, 0x2d);
const GARBAGE = bytesFrom(0x00, 0x01, 0x02, 0x03, 0x04);
const RIFF_NOT_WEBP = bytesFrom(
  0x52,
  0x49,
  0x46,
  0x46,
  0x00,
  0x00,
  0x00,
  0x00,
  0x57,
  0x41,
  0x56,
  0x45,
);

describe("detectImageMediaType", () => {
  it.each([
    ["PNG", PNG, "image/png"],
    ["JPEG", JPEG, "image/jpeg"],
    ["GIF87a", GIF87, "image/gif"],
    ["GIF89a", GIF89, "image/gif"],
    ["WebP", WEBP, "image/webp"],
    ["BMP", BMP, "image/bmp"],
  ])("identifies %s magic bytes", (_label, bytes, expected) => {
    expect(detectImageMediaType(bytes)).toBe(expected);
  });

  it("returns null for unrecognised bytes", () => {
    expect(detectImageMediaType(GARBAGE)).toBeNull();
  });

  it("returns null for RIFF container that is not WEBP", () => {
    expect(detectImageMediaType(RIFF_NOT_WEBP)).toBeNull();
  });

  it("returns null for input shorter than every signature", () => {
    expect(detectImageMediaType(Uint8Array.from([0xff]))).toBeNull();
  });
});

describe("toImagePart", () => {
  it("returns a data URL with the sniffed media type for PNG bytes", () => {
    const part = toImagePart(PNG);
    expect(part.type).toBe("image");
    expect(part.image.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("returns a data URL with the sniffed media type for JPEG bytes", () => {
    const part = toImagePart(JPEG);
    expect(part.image.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("ignores the file-extension hint and trusts the magic bytes", () => {
    const part = toImagePart(JPEG, "creator-id.png");
    expect(part.image.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("round-trips bytes through base64", () => {
    const part = toImagePart(PNG);
    const base64Payload = part.image.slice("data:image/png;base64,".length);
    const decoded = Uint8Array.from(atob(base64Payload), (ch) => ch.charCodeAt(0));
    expect(decoded.length).toBe(PNG.length);
    for (let i = 0; i < PNG.length; i += 1) {
      expect(decoded[i]).toBe(PNG[i] as number);
    }
  });

  it("throws on unrecognised bytes, including the sourceHint in the message", () => {
    expect(() => toImagePart(GARBAGE, "case-001-bank-statement.png")).toThrow(
      /case-001-bank-statement\.png/,
    );
  });

  it("throws without a sourceHint when none provided", () => {
    expect(() => toImagePart(GARBAGE)).toThrow(/do not match any supported image format/);
  });
});

describe("isPdf", () => {
  it("identifies the %PDF magic marker", () => {
    expect(isPdf(PDF)).toBe(true);
  });

  it("returns false for raster image bytes", () => {
    expect(isPdf(PNG)).toBe(false);
    expect(isPdf(JPEG)).toBe(false);
  });

  it("returns false for input shorter than the marker", () => {
    expect(isPdf(Uint8Array.from([0x25, 0x50]))).toBe(false);
  });
});

describe("toFilePart", () => {
  it("returns a data URL carrying the given media type", () => {
    const part = toFilePart(PDF, "application/pdf");
    expect(part.type).toBe("file");
    expect(part.mediaType).toBe("application/pdf");
    expect(part.data.startsWith("data:application/pdf;base64,")).toBe(true);
  });

  it("round-trips bytes through base64", () => {
    const part = toFilePart(PDF, "application/pdf");
    const payload = part.data.slice("data:application/pdf;base64,".length);
    const decoded = Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0));
    expect(decoded.length).toBe(PDF.length);
    for (let i = 0; i < PDF.length; i += 1) {
      expect(decoded[i]).toBe(PDF[i] as number);
    }
  });
});

describe("toDocumentPart", () => {
  it("routes a PDF to a file part with application/pdf", () => {
    const part = toDocumentPart(PDF);
    expect(part.type).toBe("file");
    if (part.type !== "file") throw new Error("expected file part");
    expect(part.mediaType).toBe("application/pdf");
    expect(part.data).toBe(PDF);
  });

  it("routes raster bytes to an image part holding the raw payload", () => {
    const part = toDocumentPart(PNG);
    expect(part.type).toBe("image");
    if (part.type !== "image") throw new Error("expected image part");
    expect(part.image).toBe(PNG);
  });

  it("routes unrecognised bytes to an image part (validated downstream by toImagePart)", () => {
    const part = toDocumentPart(GARBAGE);
    expect(part.type).toBe("image");
  });
});

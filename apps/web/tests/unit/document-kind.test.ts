import { describe, expect, it } from "bun:test";
import { classifyDocumentKind } from "../../src/components/case/document-kind.ts";

describe("classifyDocumentKind", () => {
  it("returns image when the content type is null", () => {
    expect(classifyDocumentKind(null)).toBe("image");
  });

  it("detects a pdf from its content type", () => {
    expect(classifyDocumentKind("application/pdf")).toBe("pdf");
  });

  it("treats image content types as image", () => {
    expect(classifyDocumentKind("image/png")).toBe("image");
    expect(classifyDocumentKind("image/jpeg")).toBe("image");
    expect(classifyDocumentKind("image/webp")).toBe("image");
  });

  it("is case-insensitive", () => {
    expect(classifyDocumentKind("Application/PDF")).toBe("pdf");
  });

  it("falls back to image for an unknown content type", () => {
    expect(classifyDocumentKind("application/octet-stream")).toBe("image");
  });
});

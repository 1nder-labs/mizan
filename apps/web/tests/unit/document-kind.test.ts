import { describe, expect, it } from "bun:test";
import { classifyDocumentKind } from "../../src/components/case/document-kind.ts";

describe("classifyDocumentKind", () => {
  it("returns image when the url is null", () => {
    expect(classifyDocumentKind(null)).toBe("image");
  });

  it("detects a pdf by path extension, ignoring query string", () => {
    expect(classifyDocumentKind("https://r2.example.com/case/doc.pdf?sig=abc")).toBe("pdf");
  });

  it("treats a non-pdf extension as image", () => {
    expect(classifyDocumentKind("https://r2.example.com/case/scan.jpg")).toBe("image");
  });

  it("is case-insensitive on the extension", () => {
    expect(classifyDocumentKind("https://r2.example.com/x/DOC.PDF")).toBe("pdf");
  });

  it("falls back to image when the url cannot be parsed", () => {
    expect(classifyDocumentKind("not a url")).toBe("image");
  });
});

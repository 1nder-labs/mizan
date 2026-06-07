/**
 * Picks whether a document is a PDF or an image from its stored content type
 * (e.g. `application/pdf`, `image/png`). The raw-serve URL has no file
 * extension, so the content type — not the URL path — is the source of truth.
 * Pure + dependency-free so it stays unit-testable without the react-pdf chunk.
 */
export function classifyDocumentKind(contentType: string | null): "pdf" | "image" {
  if (!contentType) return "image";
  return contentType.toLowerCase().includes("pdf") ? "pdf" : "image";
}

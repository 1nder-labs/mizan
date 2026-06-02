/**
 * Sniffs whether a presigned document URL points at a PDF or an image,
 * by file extension on the URL path. Pure + dependency-free so it stays
 * unit-testable without pulling the react-pdf viewer chunk.
 */
export function classifyDocumentKind(url: string | null): "pdf" | "image" {
  if (!url) return "image";
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "image";
  } catch {
    return "image";
  }
}

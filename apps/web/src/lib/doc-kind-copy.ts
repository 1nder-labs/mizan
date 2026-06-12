/**
 * Client-facing copy for the three core evidence document kinds + the evidence
 * completeness label. Imported by the evidence + document surfaces.
 */
import type { DocumentKey } from "@mizan/shared";

const DOC_KIND_DISPLAY: Readonly<Record<DocumentKey, string>> = {
  creator_id: "Creator ID",
  bank_statement: "Bank statement",
  category_doc: "Category document",
};

/** Returns the client-facing label for one of the three core evidence docs. */
export function docKindDisplay(docKind: DocumentKey): string {
  return DOC_KIND_DISPLAY[docKind];
}

const DOC_KIND_WHY: Readonly<Record<DocumentKey, string>> = {
  creator_id: "Confirms who is organizing this campaign.",
  bank_statement: "Shows funds will reach the right account.",
  category_doc: "Backs up the specific need you're raising for.",
};

/** A one-line reason each core evidence doc is needed, shown under its row. */
export function docKindWhy(docKind: DocumentKey): string {
  return DOC_KIND_WHY[docKind];
}

/** Completeness label for the evidence panel, e.g. "2 of 3 documents uploaded". */
export function evidenceProgress(uploaded: number, total: number): string {
  if (uploaded >= total) return `All ${total} documents uploaded`;
  return `${uploaded} of ${total} documents uploaded`;
}

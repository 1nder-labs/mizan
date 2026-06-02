import { DocumentKeyEnum, type DocumentKey } from "@mizan/shared";

const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

type BodyValue = string | File | (string | File)[];

export type EvidenceInput =
  | { readonly ok: true; readonly file: File; readonly docKind: DocumentKey }
  | { readonly ok: false };

/**
 * Validates a multipart evidence upload: a single `file` field (image or PDF,
 * within the size cap) plus a `docKind` field constrained to the three core doc
 * kinds. `docKind` is the only client-supplied component of the R2 key and is
 * checked against the enum here; the uploaded filename is never used, so the
 * derived key can never traverse outside the `<caseId>/` prefix. Any deviation
 * (missing/array file, unknown kind, empty/oversize file, disallowed MIME)
 * collapses to a single `ok: false`, surfaced by the route as 400.
 */
export function readEvidenceInput(form: Record<string, BodyValue>): EvidenceInput {
  const file = form["file"];
  const docKindRaw = form["docKind"];
  if (!(file instanceof File) || typeof docKindRaw !== "string") return { ok: false };
  const docKind = DocumentKeyEnum.safeParse(docKindRaw);
  if (!docKind.success) return { ok: false };
  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) return { ok: false };
  if (!ALLOWED_MIME.has(file.type)) return { ok: false };
  return { ok: true, file, docKind: docKind.data };
}

/** Server-derived R2 key — no client filename, cannot escape the case prefix. */
export function evidenceKey(caseId: string, docKind: DocumentKey): string {
  return `${caseId}/${docKind}`;
}

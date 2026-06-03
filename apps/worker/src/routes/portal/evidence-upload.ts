import { DocumentKeyEnum, type DocumentKey } from "@mizan/shared";

const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;
const MAGIC_HEAD_BYTES = 12;

/**
 * Magic-byte signatures for the allowed upload types. The client-reported
 * `file.type` is attacker-controlled (a renamed `.html` can claim
 * `application/pdf`), so the content type is derived HERE from the leading
 * bytes and is what the route stores on the R2 object — never the client claim.
 * WEBP carries its marker at offset 8 (`RIFF<size>WEBP`); the rest sit at 0.
 */
const MAGIC_SIGNATURES: ReadonlyArray<{
  readonly mime: string;
  readonly bytes: readonly number[];
  readonly offset: number;
}> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: "image/webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

export type EvidenceInput =
  | {
      readonly ok: true;
      readonly file: File;
      readonly docKind: DocumentKey;
      readonly contentType: string;
    }
  | { readonly ok: false };

/** Returns the canonical MIME for the leading bytes, or null if none match. */
function sniffMime(head: Uint8Array): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.bytes.every((b, i) => head[sig.offset + i] === b)) return sig.mime;
  }
  return null;
}

/**
 * Validates a multipart evidence upload: a single `file` field whose ACTUAL
 * leading bytes match one of the allowed types (PDF / PNG / JPEG / WEBP) and is
 * within the size cap, plus a `docKind` field constrained to the three core doc
 * kinds. `docKind` is the only client-supplied component of the R2 key and is
 * checked against the enum here; the uploaded filename is never used, so the
 * derived key can never traverse outside the `<caseId>/` prefix. The returned
 * `contentType` is the sniffed type, not the client `file.type`. Any deviation
 * (missing/array file, unknown kind, empty/oversize file, bytes matching no
 * allowed type) collapses to a single `ok: false`, surfaced by the route as 400.
 */
export async function readEvidenceInput(form: Record<string, unknown>): Promise<EvidenceInput> {
  const file = form["file"];
  const docKindRaw = form["docKind"];
  if (!(file instanceof File) || typeof docKindRaw !== "string") return { ok: false };
  const docKind = DocumentKeyEnum.safeParse(docKindRaw);
  if (!docKind.success) return { ok: false };
  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) return { ok: false };
  const head = new Uint8Array(await file.slice(0, MAGIC_HEAD_BYTES).arrayBuffer());
  const contentType = sniffMime(head);
  if (contentType === null) return { ok: false };
  return { ok: true, file, docKind: docKind.data, contentType };
}

/** Server-derived R2 key — no client filename, cannot escape the case prefix. */
export function evidenceKey(caseId: string, docKind: DocumentKey): string {
  return `${caseId}/${docKind}`;
}

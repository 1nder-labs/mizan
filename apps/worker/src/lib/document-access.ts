/**
 * Shared document-access helpers used by BOTH the reviewer (`case-documents.ts`)
 * and client (`portal/campaign-documents.ts`) surfaces: build the versioned
 * document list, mint a per-file URL (presigned in prod, same-origin raw path
 * locally), and stream raw bytes. Ownership/tenant scoping is the caller's job;
 * these operate on already-scoped rows.
 */
import type { DocumentRow } from "@mizan/db";
import { DocumentsListResponseSchema, type DocumentsListResponse } from "@mizan/shared";
import type { CloudflareBindings } from "../env.ts";
import { signR2GetUrl } from "./r2-presign.ts";

const PRESIGN_TTL_SECONDS = 300;
const DEFAULT_BUCKET_NAME = "mizan-uploads";

export interface DocumentFileUrl {
  readonly url: string;
  readonly expiresInSeconds: number;
  readonly contentType: string;
}

/**
 * Maps document rows (newest-first) to the wire list, flagging the latest row
 * per extraction slot as `is_current`. `supplementary` rows have no versioning,
 * so each is its own current.
 */
export function buildDocumentsList(rows: readonly DocumentRow[]): DocumentsListResponse {
  const slotSeen = new Set<string>();
  const documents = rows.map((row) => {
    const isCurrent = row.doc_kind === "supplementary" || !slotSeen.has(row.doc_kind);
    if (row.doc_kind !== "supplementary") slotSeen.add(row.doc_kind);
    return {
      id: row.id,
      doc_kind: row.doc_kind,
      filename: row.filename,
      content_type: row.content_type,
      uploaded_at: row.uploaded_at.getTime(),
      is_current: isCurrent,
    };
  });
  return DocumentsListResponseSchema.parse({ documents });
}

/** R2 presign credentials, or null in local Miniflare dev (no creds bound). */
export function readR2Creds(env: CloudflareBindings): {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
} | null {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return {
    accountId,
    bucket: env.R2_BUCKET_NAME ?? DEFAULT_BUCKET_NAME,
    accessKeyId,
    secretAccessKey,
  };
}

/** Presigned remote-R2 URL in prod; a same-origin raw-serve path in local dev. */
export async function buildFileUrl(
  env: CloudflareBindings,
  doc: DocumentRow,
  rawPath: string,
): Promise<DocumentFileUrl> {
  const creds = readR2Creds(env);
  if (!creds) {
    return { url: rawPath, expiresInSeconds: PRESIGN_TTL_SECONDS, contentType: doc.content_type };
  }
  const signed = await signR2GetUrl({
    accountId: creds.accountId,
    bucket: creds.bucket,
    objectKey: doc.r2_key,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    ttlSeconds: PRESIGN_TTL_SECONDS,
  });
  return { url: signed.url, expiresInSeconds: PRESIGN_TTL_SECONDS, contentType: doc.content_type };
}

/** Streams an R2 object's bytes, or null when the object is gone. */
export async function streamDocument(
  env: CloudflareBindings,
  doc: DocumentRow,
): Promise<Response | null> {
  const object = await env.R2_BUCKET.get(doc.r2_key);
  if (!object) return null;
  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? doc.content_type);
  headers.set("Cache-Control", "private, max-age=300");
  return new Response(await object.arrayBuffer(), { headers });
}

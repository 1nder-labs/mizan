/**
 * Document URL route — named extraction slots.
 *
 * `GET /api/cases/:id/documents/:docKey/url` returns a short-TTL R2
 * presigned URL for the CURRENT version of one of the three named per-case
 * attachments (`creator_id`, `bank_statement`, `category_doc`). "Current" is
 * the latest row in the `documents` table for that slot. The browser fetches
 * the URL directly; the Worker stays out of the doc-bytes path. Supplementary
 * docs + prior versions are served by the by-id routes in `case-documents.ts`.
 *
 * Auth: shared-queue (`reviewer | admin`). Errors: 404 (case missing),
 * 409 (slot has no upload yet), 400 (invalid docKey via zod), 500 (signing).
 */
import { zValidator } from "@hono/zod-validator";
import { and, cases as casesTable, currentExtractedDocument, eq, makeDb, type Db } from "@mizan/db";
import {
  DocumentKeyEnum,
  DocumentUrlErrorBodySchema,
  DocumentUrlResponseSchema,
  type DocumentKey,
  type DocumentUrlErrorCode,
} from "@mizan/shared";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { signR2GetUrl } from "../lib/r2-presign.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";

type DocContext = Context<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>;
type KeyResolution =
  | { readonly ok: true; readonly objectKey: string; readonly contentType: string }
  | { readonly ok: false; readonly status: 404 | 409; readonly code: DocumentUrlErrorCode };

const PRESIGN_TTL_SECONDS = 300;
const DEFAULT_BUCKET_NAME = "mizan-uploads";

const ParamSchema = z.object({
  id: z.string().uuid(),
  docKey: DocumentKeyEnum,
});

function docErrorBody(code: DocumentUrlErrorCode): { error: DocumentUrlErrorCode } {
  return DocumentUrlErrorBodySchema.parse({ error: code });
}

/**
 * Whether the case exists within the viewer's organization. A case in another
 * org resolves as non-existent so presigned R2 URLs can never be minted across
 * tenant boundaries.
 */
async function caseExistsInOrg(db: Db, caseId: string, organizationId: string): Promise<boolean> {
  const row = await db
    .select({ id: casesTable.id })
    .from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.organization_id, organizationId)))
    .get();
  return row !== undefined;
}

function readR2Creds(env: CloudflareBindings): {
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

/** Org-scoped: resolves the current R2 object key for a named slot, or a denial. */
async function resolveDocObjectKey(
  c: DocContext,
  id: string,
  docKey: DocumentKey,
): Promise<KeyResolution> {
  const db = makeDb(c.env.DB);
  const org = c.var.viewer.organizationId;
  if (!(await caseExistsInOrg(db, id, org))) return { ok: false, status: 404, code: "not_found" };
  const doc = await currentExtractedDocument(db, id, org, docKey);
  if (!doc) return { ok: false, status: 409, code: "not_ready" };
  return { ok: true, objectKey: doc.r2_key, contentType: doc.content_type };
}

/** Production path: a short-TTL presigned remote-R2 GET URL. */
async function presignedUrlResponse(
  c: DocContext,
  objectKey: string,
  docKey: DocumentKey,
  contentType: string,
  creds: NonNullable<ReturnType<typeof readR2Creds>>,
): Promise<Response> {
  try {
    const signed = await signR2GetUrl({
      accountId: creds.accountId,
      bucket: creds.bucket,
      objectKey,
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      ttlSeconds: PRESIGN_TTL_SECONDS,
    });
    const body = DocumentUrlResponseSchema.parse({
      url: signed.url,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
      docKey,
      contentType,
    });
    return c.json(body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[documents] presign failed (docKey=${docKey}): ${reason}`);
    return c.json(docErrorBody("presign_failed"), 500);
  }
}

export const documentsRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .get("/:id/documents/:docKey/url", zValidator("param", ParamSchema), async (c) => {
    const { id, docKey } = c.req.valid("param");
    const resolved = await resolveDocObjectKey(c, id, docKey);
    if (!resolved.ok) return c.json(docErrorBody(resolved.code), resolved.status);
    const creds = readR2Creds(c.env);
    if (creds)
      return presignedUrlResponse(c, resolved.objectKey, docKey, resolved.contentType, creds);
    /**
     * No presign creds → local Miniflare dev. There is no R2 presign endpoint
     * locally, so hand back a same-origin raw-serve path the Worker streams
     * from the bound bucket. Presign stays the production path above.
     */
    const body = DocumentUrlResponseSchema.parse({
      url: `/api/cases/${id}/documents/${docKey}/raw`,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
      docKey,
      contentType: resolved.contentType,
    });
    return c.json(body);
  })
  .get("/:id/documents/:docKey/raw", zValidator("param", ParamSchema), async (c) => {
    const { id, docKey } = c.req.valid("param");
    const resolved = await resolveDocObjectKey(c, id, docKey);
    if (!resolved.ok) return c.json(docErrorBody(resolved.code), resolved.status);
    const object = await c.env.R2_BUCKET.get(resolved.objectKey);
    if (!object) return c.json(docErrorBody("not_ready"), 404);
    const bytes = await object.arrayBuffer();
    const headers = new Headers();
    headers.set("Content-Type", object.httpMetadata?.contentType ?? resolved.contentType);
    headers.set("Cache-Control", "private, max-age=300");
    return new Response(bytes, { headers });
  });

/**
 * Document URL route — Phase 7.5 U3.
 *
 * `GET /api/cases/:id/documents/:docKey/url` returns a short-TTL R2
 * presigned URL for one of the three known per-case attachments
 * (`creator_id`, `bank_statement`, `category_doc`). The browser fetches
 * the URL directly; the Worker stays out of the doc-bytes path.
 *
 * Auth: shared-queue (`reviewer | admin`) — matches the existing case
 * read surface. No per-owner filter (consistent with `cases-list.ts`).
 *
 * Errors: 404 (case missing), 409 (no overlay → DRAFT pre-seed),
 * 400 (invalid docKey via zod), 500 (signing failure — logged).
 */
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { cases as casesTable, makeDb, type Db } from "@mizan/db";
import {
  CaseOverlaySchema,
  DocumentKeyEnum,
  DocumentUrlErrorBodySchema,
  DocumentUrlResponseSchema,
  type DocumentKey,
  type DocumentUrlErrorCode,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { signR2GetUrl } from "../lib/r2-presign.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";

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
 * Loads the case overlay scoped to the viewer's organization. A case in
 * another organization resolves as non-existent so presigned R2 URLs can
 * never be minted across tenant boundaries.
 */
async function loadCaseOverlay(
  db: Db,
  caseId: string,
  organizationId: string,
): Promise<{ overlay: unknown | null; exists: boolean }> {
  const row = await db
    .select({ brief_partial_json: casesTable.brief_partial_json })
    .from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.organization_id, organizationId)))
    .get();
  if (!row) return { overlay: null, exists: false };
  return { overlay: row.brief_partial_json, exists: true };
}

function resolveObjectKey(overlayRaw: unknown, docKey: DocumentKey): string | null {
  const parsed = CaseOverlaySchema.safeParse(overlayRaw);
  if (!parsed.success) return null;
  return parsed.data.r2_keys[docKey] ?? null;
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

export const documentsRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>().get("/:id/documents/:docKey/url", zValidator("param", ParamSchema), async (c) => {
  const { id, docKey } = c.req.valid("param");
  const db = makeDb(c.env.DB);
  const { overlay, exists } = await loadCaseOverlay(db, id, c.var.viewer.organizationId);
  if (!exists) return c.json(docErrorBody("not_found"), 404);
  const objectKey = resolveObjectKey(overlay, docKey);
  if (!objectKey) return c.json(docErrorBody("not_ready"), 409);
  const creds = readR2Creds(c.env);
  if (!creds) {
    console.error(`[documents] missing R2 creds in env (case=${id})`);
    return c.json(docErrorBody("storage_unconfigured"), 500);
  }
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
    });
    return c.json(body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[documents] presign failed (case=${id} docKey=${docKey}): ${reason}`);
    return c.json(docErrorBody("presign_failed"), 500);
  }
});

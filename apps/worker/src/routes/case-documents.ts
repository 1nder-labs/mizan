/**
 * Reviewer document history + by-id access (mounted under `/api/cases`).
 *
 * - `GET /:id/documents` — every uploaded document for the case (current
 *   versions, prior versions, supplementary), newest first.
 * - `GET /:id/documents/by/:docId/url` — a viewable URL for one document
 *   (presigned in prod, same-origin raw path locally).
 * - `GET /:id/documents/by/:docId/raw` — streams the bytes (local dev).
 *
 * Named-slot current-version URLs stay in `documents.ts`; this file owns the
 * version history + supplementary surface. Org-scoped (no cross-tenant leak).
 */
import { zValidator } from "@hono/zod-validator";
import { documentById, listCaseDocuments, makeDb } from "@mizan/db";
import {
  DocumentFileUrlResponseSchema,
  DocumentUrlErrorBodySchema,
  type DocumentUrlErrorCode,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { buildDocumentsList, buildFileUrl, streamDocument } from "../lib/document-access.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";

const ParamId = z.object({ id: z.string().uuid() });
const ParamDoc = z.object({ id: z.string().uuid(), docId: z.string().min(1) });

function notFound(code: DocumentUrlErrorCode): { error: DocumentUrlErrorCode } {
  return DocumentUrlErrorBodySchema.parse({ error: code });
}

export const caseDocumentsRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .get("/:id/documents", zValidator("param", ParamId), async (c) => {
    const db = makeDb(c.env.DB);
    const rows = await listCaseDocuments(db, c.req.valid("param").id, c.var.viewer.organizationId);
    return c.json(buildDocumentsList(rows));
  })
  .get("/:id/documents/by/:docId/url", zValidator("param", ParamDoc), async (c) => {
    const { id, docId } = c.req.valid("param");
    const db = makeDb(c.env.DB);
    const doc = await documentById(db, id, c.var.viewer.organizationId, docId);
    if (!doc) return c.json(notFound("not_found"), 404);
    const url = await buildFileUrl(c.env, doc, `/api/cases/${id}/documents/by/${docId}/raw`);
    return c.json(DocumentFileUrlResponseSchema.parse(url));
  })
  .get("/:id/documents/by/:docId/raw", zValidator("param", ParamDoc), async (c) => {
    const { id, docId } = c.req.valid("param");
    const db = makeDb(c.env.DB);
    const doc = await documentById(db, id, c.var.viewer.organizationId, docId);
    if (!doc) return c.json(notFound("not_found"), 404);
    const streamed = await streamDocument(c.env, doc);
    return streamed ?? c.json(notFound("not_found"), 404);
  });

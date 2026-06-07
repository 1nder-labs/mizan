/**
 * Client document history + by-id access (mounted under `/api/portal/campaigns`).
 * Owner-scoped via `loadOwnedCampaign`: a client only ever sees documents of a
 * campaign they own. The client views inline via the auth-gated raw endpoint
 * (no presign needed for a client viewing their own low-volume uploads).
 *
 * - `GET /:id/documents` — every document for the campaign, newest first.
 * - `GET /:id/documents/:docId/raw` — streams the bytes.
 */
import { zValidator } from "@hono/zod-validator";
import { documentById, listCaseDocuments, makeDb } from "@mizan/db";
import { PortalErrorBodySchema, type PortalErrorBody } from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../../env.ts";
import { buildDocumentsList, streamDocument } from "../../lib/document-access.ts";
import type { ViewerVariables } from "../../middleware/require-role.ts";
import { loadOwnedCampaign } from "./ownership.ts";

const ParamId = z.object({ id: z.string().uuid() });
const ParamDoc = z.object({ id: z.string().uuid(), docId: z.string().min(1) });

function notOwned(): PortalErrorBody {
  return PortalErrorBodySchema.parse({ error: "campaign_not_found" });
}

export const campaignDocumentsRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .get("/:id/documents", zValidator("param", ParamId), async (c) => {
    const db = makeDb(c.env.DB);
    const viewer = c.var.viewer;
    const owned = await loadOwnedCampaign(db, viewer, c.req.valid("param").id);
    if (!owned.ok) return c.json(notOwned(), 404);
    const rows = await listCaseDocuments(db, owned.campaign.id, viewer.organizationId);
    return c.json(buildDocumentsList(rows));
  })
  .get("/:id/documents/:docId/raw", zValidator("param", ParamDoc), async (c) => {
    const { id, docId } = c.req.valid("param");
    const db = makeDb(c.env.DB);
    const viewer = c.var.viewer;
    const owned = await loadOwnedCampaign(db, viewer, id);
    if (!owned.ok) return c.json(notOwned(), 404);
    const doc = await documentById(db, id, viewer.organizationId, docId);
    if (!doc) return c.json(notOwned(), 404);
    const streamed = await streamDocument(c.env, doc);
    return streamed ?? c.json(notOwned(), 404);
  });

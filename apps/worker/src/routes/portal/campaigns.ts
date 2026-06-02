import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { cases, makeDb, type Db } from "@mizan/db";
import {
  CampaignCreateSchema,
  CampaignMutationResponseSchema,
  CaseNotesResponseSchema,
  CaseOverlaySchema,
  ClientCampaignsResponseSchema,
  EvidenceUploadResponseSchema,
  PortalErrorBodySchema,
  type CampaignCreate,
  type CaseOverlay,
  type ViewerContext,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../../env.ts";
import { readCaseNotes, writeCaseNote } from "../../lib/case-notes.ts";
import { buildClientCaseDetail, listClientCampaigns } from "../../lib/client-views.ts";
import type { ViewerVariables } from "../../middleware/require-role.ts";
import { evidenceKey, readEvidenceInput } from "./evidence-upload.ts";
import { loadOwnedCampaign } from "./ownership.ts";

const EMPTY_R2_KEYS = { creator_id: "", bank_statement: "", category_doc: "" } as const;
const CampaignParamSchema = z.object({ id: z.string().uuid() });

/** Builds the strict overlay from intake fields, carrying the evidence keys in. */
function buildOverlay(input: CampaignCreate, r2_keys: CaseOverlay["r2_keys"]): CaseOverlay {
  return CaseOverlaySchema.parse({
    story: input.story,
    organizer_name: input.organizer_name,
    r2_keys,
    ...(input.vouching_narrative !== undefined
      ? { vouching_narrative: input.vouching_narrative }
      : {}),
  });
}

/** Preserves evidence keys across an edit; defaults to empty if absent/invalid. */
function existingR2Keys(overlay: CaseOverlay | null): CaseOverlay["r2_keys"] {
  const parsed = overlay ? CaseOverlaySchema.safeParse(overlay) : null;
  return parsed?.success ? parsed.data.r2_keys : { ...EMPTY_R2_KEYS };
}

function createCampaign(db: Db, viewer: ViewerContext, input: CampaignCreate) {
  return db
    .insert(cases)
    .values({
      status: "DRAFT",
      title: input.organizer_name,
      category: input.category,
      geography: input.geography,
      claimed_zakat_category: input.claimed_zakat_category ?? null,
      brief_partial_json: buildOverlay(input, { ...EMPTY_R2_KEYS }),
      created_by: viewer.userId,
      organization_id: viewer.organizationId,
    })
    .returning({ id: cases.id, status: cases.status });
}

/**
 * Best-effort client_facing note recording an evidence upload — this is what
 * flags `clientResponded` for the reviewer (KTD-7). A note-write failure must
 * not fail the upload (the object + overlay key are already persisted), so it
 * is logged at this single seam rather than rethrown into a 500.
 */
async function attachEvidenceNote(
  db: Db,
  viewer: ViewerContext,
  caseId: string,
  docKind: string,
): Promise<void> {
  try {
    await writeCaseNote(db, {
      caseId,
      organizationId: viewer.organizationId,
      authorUserId: viewer.userId,
      authorRole: "client",
      visibility: "client_facing",
      body: `Uploaded ${docKind.replace(/_/g, " ")}.`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `[portal] evidence note attach failed (case=${caseId} doc=${docKind}): ${reason}`,
    );
  }
}

/**
 * Client campaign intake (`/api/portal/campaigns`). Create lands a DRAFT case
 * in the review org owned by the client; edit re-submits the intake fields but
 * only while the case is still DRAFT. The edit is a single conditional UPDATE
 * gated on `status = 'DRAFT'` (mirroring the assign-route optimistic guard), so
 * it races safely against a reviewer running the brief (DRAFT -> RUNNING):
 * zero rows updated means the reviewer won, and the client gets 409 rather than
 * a silent overwrite. `GET /:id` is the U3 ownership skeleton; later units flesh
 * it into the friendly client detail.
 */
export const campaignRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .post("/", zValidator("json", CampaignCreateSchema), async (c) => {
    const [created] = await createCampaign(makeDb(c.env.DB), c.var.viewer, c.req.valid("json"));
    return c.json(CampaignMutationResponseSchema.parse(created), 201);
  })
  .get("/", async (c) => {
    const campaigns = await listClientCampaigns(makeDb(c.env.DB), c.var.viewer);
    return c.json(ClientCampaignsResponseSchema.parse({ campaigns }));
  })
  .get("/:id", zValidator("param", CampaignParamSchema), async (c) => {
    const db = makeDb(c.env.DB);
    const owned = await loadOwnedCampaign(db, c.var.viewer, c.req.valid("param").id);
    if (!owned.ok) return c.json(PortalErrorBodySchema.parse({ error: "campaign_not_found" }), 404);
    return c.json(await buildClientCaseDetail(db, c.var.viewer, owned.campaign));
  })
  .patch(
    "/:id",
    zValidator("param", CampaignParamSchema),
    zValidator("json", CampaignCreateSchema),
    async (c) => {
      const db = makeDb(c.env.DB);
      const { id } = c.req.valid("param");
      const viewer = c.var.viewer;
      const owned = await loadOwnedCampaign(db, viewer, id);
      if (!owned.ok)
        return c.json(PortalErrorBodySchema.parse({ error: "campaign_not_found" }), 404);
      const input = c.req.valid("json");
      const updated = await db
        .update(cases)
        .set({
          title: input.organizer_name,
          category: input.category,
          geography: input.geography,
          claimed_zakat_category: input.claimed_zakat_category ?? null,
          brief_partial_json: buildOverlay(
            input,
            existingR2Keys(owned.campaign.brief_partial_json),
          ),
          updated_at: new Date(),
        })
        .where(
          and(eq(cases.id, id), eq(cases.created_by, viewer.userId), eq(cases.status, "DRAFT")),
        )
        .returning({ id: cases.id, status: cases.status });
      if (updated.length === 0)
        return c.json(PortalErrorBodySchema.parse({ error: "case_no_longer_draft" }), 409);
      return c.json(CampaignMutationResponseSchema.parse(updated[0]), 200);
    },
  )
  .post("/:id/evidence", zValidator("param", CampaignParamSchema), async (c) => {
    const db = makeDb(c.env.DB);
    const { id } = c.req.valid("param");
    const owned = await loadOwnedCampaign(db, c.var.viewer, id);
    if (!owned.ok) return c.json(PortalErrorBodySchema.parse({ error: "campaign_not_found" }), 404);
    const input = readEvidenceInput(await c.req.parseBody());
    if (!input.ok) return c.json(PortalErrorBodySchema.parse({ error: "invalid_evidence" }), 400);
    const key = evidenceKey(id, input.docKind);
    await c.env.R2_BUCKET.put(key, await input.file.arrayBuffer(), {
      httpMetadata: { contentType: input.file.type },
    });
    await db
      .update(cases)
      .set({
        brief_partial_json: sql`json_set(${cases.brief_partial_json}, ${`$.r2_keys.${input.docKind}`}, ${key})`,
        updated_at: new Date(),
      })
      .where(and(eq(cases.id, id), eq(cases.created_by, c.var.viewer.userId)));
    await attachEvidenceNote(db, c.var.viewer, id, input.docKind);
    return c.json(EvidenceUploadResponseSchema.parse({ docKind: input.docKind, key }), 201);
  })
  .get("/:id/notes", zValidator("param", CampaignParamSchema), async (c) => {
    const db = makeDb(c.env.DB);
    const owned = await loadOwnedCampaign(db, c.var.viewer, c.req.valid("param").id);
    if (!owned.ok) return c.json(PortalErrorBodySchema.parse({ error: "campaign_not_found" }), 404);
    const notes = await readCaseNotes(db, c.var.viewer, owned.campaign.id);
    return c.json(CaseNotesResponseSchema.parse({ notes }));
  });

import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { cases, makeDb, type Db } from "@mizan/db";
import {
  CampaignCreateSchema,
  CampaignMutationResponseSchema,
  CaseOverlaySchema,
  PortalErrorBodySchema,
  type CampaignCreate,
  type CaseOverlay,
  type ViewerContext,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../../env.ts";
import type { ViewerVariables } from "../../middleware/require-role.ts";
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
  .get("/:id", zValidator("param", CampaignParamSchema), async (c) => {
    const owned = await loadOwnedCampaign(makeDb(c.env.DB), c.var.viewer, c.req.valid("param").id);
    if (!owned.ok) return c.json(PortalErrorBodySchema.parse({ error: "campaign_not_found" }), 404);
    return c.json({ id: owned.campaign.id });
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
  );

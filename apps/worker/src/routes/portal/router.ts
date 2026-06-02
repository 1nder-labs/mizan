import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { makeDb } from "@mizan/db";
import { PortalErrorBodySchema } from "@mizan/shared";
import type { CloudflareBindings } from "../../env.ts";
import { requireRole, type ViewerVariables } from "../../middleware/require-role.ts";
import { loadOwnedCampaign } from "./ownership.ts";

const CampaignParamSchema = z.object({ id: z.string().uuid() });

/**
 * Client-facing campaign portal (`/api/portal/*`). Gated to the `client` role
 * — reviewers/admins get 403, anonymous callers 401 — and every per-campaign
 * route resolves its id through `loadOwnedCampaign`, so a client only ever
 * reaches campaigns they created in the review org (cross-client ids resolve
 * 404, no existence leak). Intake, evidence, notes, and the friendly
 * list/detail surfaces are layered on by later units; U3 lands the route
 * group, the role gate, and the ownership boundary with one read route.
 */
export const portalRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .use("*", requireRole(["client"]))
  .get("/campaigns/:id", zValidator("param", CampaignParamSchema), async (c) => {
    const owned = await loadOwnedCampaign(makeDb(c.env.DB), c.var.viewer, c.req.valid("param").id);
    if (!owned.ok) {
      return c.json(PortalErrorBodySchema.parse({ error: "campaign_not_found" }), 404);
    }
    return c.json({ id: owned.campaign.id });
  });

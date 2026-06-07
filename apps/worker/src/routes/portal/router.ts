import { Hono } from "hono";
import type { CloudflareBindings } from "../../env.ts";
import { requireRole, type ViewerVariables } from "../../middleware/require-role.ts";
import { campaignRoutes } from "./campaigns.ts";
import { campaignDocumentsRoutes } from "./campaign-documents.ts";

/**
 * Client-facing campaign portal (`/api/portal/*`). Gated to the `client` role
 * — reviewers/admins get 403, anonymous callers 401 — and composed from
 * per-concern sub-routers. Every per-campaign route resolves its id through the
 * ownership guard (`loadOwnedCampaign`), so a client only ever reaches
 * campaigns they created in the review org; cross-client ids resolve 404 with
 * no existence leak. Evidence, notes, and the friendly list/detail surfaces are
 * layered on by later units.
 */
export const portalRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .use("*", requireRole(["client"]))
  .route("/campaigns", campaignRoutes)
  .route("/campaigns", campaignDocumentsRoutes);

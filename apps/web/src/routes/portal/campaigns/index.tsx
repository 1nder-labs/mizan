/**
 * `/portal/campaigns` route — client's campaign list.
 * Guarded by `requireClient` (bounces non-clients to /queue, anon to /login).
 * Prefetches the campaigns list in the loader.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireClient } from "@/lib/auth-client.ts";
import { clientCampaignsQueryOptions } from "@/lib/portal-api.ts";
import { PortalCampaignsPage } from "@/components/portal/campaigns-page.tsx";

export const Route = createFileRoute("/portal/campaigns/")({
  beforeLoad: ({ context }) => requireClient(context.queryClient),
  loader: ({ context }) => context.queryClient.ensureQueryData(clientCampaignsQueryOptions()),
  component: PortalCampaignsPage,
});

/**
 * `/portal/campaigns/$campaignId` route — client campaign detail.
 * Guarded by `requireClient`. Prefetches the campaign detail in the loader.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireClient } from "@/lib/auth-client.ts";
import { clientCampaignQueryOptions } from "@/lib/portal-api.ts";
import { PortalCampaignDetailPage } from "@/components/portal/campaign-detail.tsx";

export const Route = createFileRoute("/portal/campaigns/$campaignId")({
  beforeLoad: ({ context }) => requireClient(context.queryClient),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(clientCampaignQueryOptions(params.campaignId)),
  component: PortalCampaignDetailPage,
});

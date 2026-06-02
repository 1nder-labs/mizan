/**
 * `/portal/campaigns/new` route — campaign intake form in create mode.
 * Guarded by `requireClient`.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requireClient } from "@/lib/auth-client.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { IntakeForm } from "@/components/portal/intake-form.tsx";
import { PortalShell } from "@/components/portal/portal-shell.tsx";

export const Route = createFileRoute("/portal/campaigns/new")({
  beforeLoad: ({ context }) => requireClient(context.queryClient),
  component: PortalNewCampaignPage,
});

function PortalNewCampaignPage(): React.JSX.Element {
  const navigate = useNavigate();

  async function handleDone(id: string): Promise<void> {
    await navigate({ to: "/portal/campaigns/$campaignId", params: { campaignId: id } });
  }

  return (
    <PortalShell>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{COPY.portal.intakeTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{COPY.portal.intakeSubtitle}</p>
      </header>
      <IntakeForm mode="create" onDone={handleDone} />
    </PortalShell>
  );
}

/**
 * Portal campaigns list page. Wrapped in `PortalShell`. Renders a table of
 * the client's campaigns or an appropriate empty/error state.
 * Rows navigate to the campaign detail page.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { clientCampaignsQueryOptions } from "@/lib/portal-api.ts";
import { COPY } from "@/lib/copy-constants.ts";
import type { ClientCampaignSummary } from "@mizan/shared";
import { PortalShell } from "@/components/portal/portal-shell.tsx";
import { ClientStatusBadge } from "@/components/portal/client-status-badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";

function CampaignRow({
  campaign,
  onNavigate,
}: {
  readonly campaign: ClientCampaignSummary;
  readonly onNavigate: (id: string) => void;
}): React.JSX.Element {
  return (
    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => onNavigate(campaign.id)}>
      <TableCell className="font-medium">{campaign.title}</TableCell>
      <TableCell>
        <ClientStatusBadge status={campaign.status} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground tabular">
        {new Date(campaign.updatedAt).toLocaleDateString()}
      </TableCell>
    </TableRow>
  );
}

function CampaignsTable({
  campaigns,
  onNavigate,
}: {
  readonly campaigns: readonly ClientCampaignSummary[];
  readonly onNavigate: (id: string) => void;
}): React.JSX.Element {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{COPY.portal.listColumnCampaign}</TableHead>
              <TableHead>{COPY.portal.listColumnStatus}</TableHead>
              <TableHead>{COPY.portal.listColumnUpdated}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c) => (
              <CampaignRow key={c.id} campaign={c} onNavigate={onNavigate} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CampaignsSkeletons(): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function CampaignsEmpty(): React.JSX.Element {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <p className="text-base font-medium">{COPY.portal.listEmptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{COPY.portal.listEmptyBody}</p>
      </CardContent>
    </Card>
  );
}

export function PortalCampaignsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { data, isPending, error } = useQuery(clientCampaignsQueryOptions());

  async function handleNew(): Promise<void> {
    await navigate({ to: "/portal/campaigns/new" });
  }

  async function handleRowNavigate(id: string): Promise<void> {
    await navigate({ to: "/portal/campaigns/$campaignId", params: { campaignId: id } });
  }

  return (
    <PortalShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{COPY.portal.listTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{COPY.portal.listSubtitle}</p>
        </div>
        <Button onClick={() => void handleNew()}>{COPY.portal.listNew}</Button>
      </header>
      {isPending ? <CampaignsSkeletons /> : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{COPY.portal.listLoadError}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
      {!isPending && !error && data ? (
        data.campaigns.length === 0 ? (
          <CampaignsEmpty />
        ) : (
          <CampaignsTable
            campaigns={data.campaigns}
            onNavigate={(id) => void handleRowNavigate(id)}
          />
        )
      ) : null}
    </PortalShell>
  );
}

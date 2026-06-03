/**
 * Client portal campaign detail page. Wrapped in `PortalShell`. Reads
 * route params via `getRouteApi` (mirrors `case/page.tsx`). Shows
 * header, organizer ask card, evidence panel, and note thread. An
 * inline edit form toggles when the campaign is still in submitted state.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import type { ClientCaseDetail, CampaignCreate } from "@mizan/shared";
import { clientCampaignQueryOptions } from "@/lib/portal-api.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { PortalShell } from "@/components/portal/portal-shell.tsx";
import { ClientStatusBadge } from "@/components/portal/client-status-badge.tsx";
import { IntakeForm } from "@/components/portal/intake-form.tsx";
import { EvidencePanel } from "@/components/portal/evidence-panel.tsx";
import { NoteThread } from "@/components/portal/note-thread.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Separator } from "@/components/ui/separator.tsx";

const campaignRoute = getRouteApi("/portal/campaigns/$campaignId");

function DetailSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function OrganizerAskCard({
  ask,
}: {
  readonly ask: NonNullable<ClientCaseDetail["organizerAsk"]>;
}): React.JSX.Element {
  return (
    <Card className="border-status-warning border">
      <CardHeader>
        <CardTitle className="text-sm font-medium">{COPY.portal.detailAskTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{ask.message}</p>
        {ask.missingItems.length > 0 ? (
          <ul className="list-disc pl-4 space-y-1">
            {ask.missingItems.map((item) => (
              <li key={item} className="text-sm text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DetailHeader({
  detail,
  editing,
  onEditToggle,
}: {
  readonly detail: ClientCaseDetail;
  readonly editing: boolean;
  readonly onEditToggle: () => void;
}): React.JSX.Element {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <Link
          to="/portal/campaigns"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {COPY.portal.detailBack}
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-semibold tracking-tight">{detail.organizerName}</h1>
          <ClientStatusBadge status={detail.status} />
        </div>
      </div>
      {detail.status === "submitted" ? (
        <Button variant="outline" size="sm" onClick={onEditToggle} disabled={editing}>
          {COPY.portal.editButton}
        </Button>
      ) : null}
    </header>
  );
}

function buildInitial(detail: ClientCaseDetail): Partial<CampaignCreate> {
  return {
    story: detail.story,
    organizer_name: detail.organizerName,
    category: detail.category,
    geography: detail.geography,
    ...(detail.claimedZakatCategory ? { claimed_zakat_category: detail.claimedZakatCategory } : {}),
    ...(detail.vouchingNarrative ? { vouching_narrative: detail.vouchingNarrative } : {}),
  };
}

function DetailBody({ detail }: { readonly detail: ClientCaseDetail }): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const evidenceReadOnly = detail.status === "approved" || detail.status === "not_approved";

  function handleEditDone(): void {
    setEditing(false);
  }

  return (
    <div className="space-y-8">
      <DetailHeader detail={detail} editing={editing} onEditToggle={() => setEditing(true)} />
      {editing ? (
        <section>
          <h2 className="mb-4 text-base font-semibold">{COPY.portal.editTitle}</h2>
          <IntakeForm
            mode="edit"
            campaignId={detail.id}
            initial={buildInitial(detail)}
            onDone={handleEditDone}
            onCancel={() => setEditing(false)}
          />
        </section>
      ) : null}
      {detail.organizerAsk ? <OrganizerAskCard ask={detail.organizerAsk} /> : null}
      <Separator />
      <section>
        <h2 className="mb-1 text-base font-semibold">{COPY.portal.detailEvidenceTitle}</h2>
        <p className="text-sm text-muted-foreground">{COPY.portal.detailEvidenceSubtitle}</p>
        <EvidencePanel
          campaignId={detail.id}
          evidence={detail.evidence}
          readOnly={evidenceReadOnly}
        />
      </section>
      <Separator />
      <section>
        <h2 className="mb-4 text-base font-semibold">{COPY.portal.detailNotesTitle}</h2>
        <NoteThread campaignId={detail.id} />
      </section>
    </div>
  );
}

export function PortalCampaignDetailPage(): React.JSX.Element {
  const { campaignId } = campaignRoute.useParams();
  const { data, isPending, error } = useQuery(clientCampaignQueryOptions(campaignId));

  if (isPending) {
    return (
      <PortalShell>
        <DetailSkeleton />
      </PortalShell>
    );
  }

  if (error || !data) {
    return (
      <PortalShell>
        <Alert variant="destructive">
          <AlertTitle>{COPY.portal.detailLoadError}</AlertTitle>
          <AlertDescription>{error?.message ?? ""}</AlertDescription>
        </Alert>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <DetailBody detail={data} />
    </PortalShell>
  );
}

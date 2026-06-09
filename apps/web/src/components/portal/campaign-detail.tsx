/**
 * Client portal campaign detail page. Wrapped in `PortalShell`. Reads
 * route params via `getRouteApi` (mirrors `case/page.tsx`). Shows
 * header, organizer ask card, evidence panel, and note thread. An
 * inline edit form toggles when the campaign is still in submitted state.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CampaignCategoryEnum, ZakatCategoryEnum } from "@mizan/shared";
import type { ClientCaseDetail, CampaignCreate } from "@mizan/shared";
import { clientCampaignQueryOptions, deleteCampaign, submitCampaign } from "@/lib/portal-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { PortalShell } from "@/components/portal/portal-shell.tsx";
import { ClientStatusBadge } from "@/components/portal/client-status-badge.tsx";
import { IntakeForm } from "@/components/portal/intake-form.tsx";
import { EvidencePanel } from "@/components/portal/evidence-panel.tsx";
import { SupplementaryDocs } from "@/components/portal/supplementary-docs.tsx";
import { NoteThread } from "@/components/portal/note-thread.tsx";
import { ClientNoteComposer } from "@/components/portal/note-composer.tsx";
import { ReviewHistory } from "@/components/portal/review-history.tsx";
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
    <Card className="rounded-xl border border-status-warning-border shadow-elev-1">
      <CardHeader>
        <CardTitle className="text-sm font-medium">{COPY.portal.detailAskTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{ask.message}</p>
        {ask.missingItems.length > 0 ? (
          <ul className="space-y-1 pl-4 list-disc">
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

/**
 * Re-submit action bar, rendered BELOW the documents so the flow reads
 * read-the-ask → add-documents → re-submit. The button stays disabled until the
 * server confirms a document landed since the reviewer's request (`canResubmit`),
 * so an unchanged case can never be bounced back.
 */
function ResubmitBar({
  campaignId,
  canResubmit,
}: {
  readonly campaignId: string;
  readonly canResubmit: boolean;
}): React.JSX.Element {
  const resubmit = useSubmitCampaign(campaignId, COPY.portal.resubmitError);
  return (
    <div className="space-y-2 rounded-xl border border-status-warning-border bg-status-warning/10 p-4 shadow-elev-1">
      <p className="text-sm font-medium text-foreground">{COPY.portal.detailAskCtaTitle}</p>
      <p className="text-sm text-muted-foreground">
        {canResubmit ? COPY.portal.detailAskCtaBody : COPY.portal.resubmitNeedsDocs}
      </p>
      <Button
        size="sm"
        onClick={() => resubmit.mutate()}
        disabled={!canResubmit || resubmit.isPending}
      >
        {resubmit.isPending ? COPY.portal.resubmitting : COPY.portal.resubmit}
      </Button>
    </div>
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
        <div className="mt-2 flex items-center gap-2">
          <h1 className="text-3xl font-semibold text-display">{detail.organizerName}</h1>
          <ClientStatusBadge status={detail.status} />
        </div>
      </div>
      {detail.status === "submitted" || detail.status === "draft" ? (
        <Button variant="outline" size="sm" onClick={onEditToggle} disabled={editing}>
          {COPY.portal.editButton}
        </Button>
      ) : null}
    </header>
  );
}

function buildInitial(detail: ClientCaseDetail): Partial<CampaignCreate> {
  const category = CampaignCategoryEnum.safeParse(detail.category);
  const zakat = detail.claimedZakatCategory
    ? ZakatCategoryEnum.safeParse(detail.claimedZakatCategory)
    : undefined;
  return {
    story: detail.story,
    organizer_name: detail.organizerName,
    geography: detail.geography,
    ...(category.success ? { category: category.data } : {}),
    ...(zakat?.success ? { claimed_zakat_category: zakat.data } : {}),
    ...(detail.vouchingNarrative ? { vouching_narrative: detail.vouchingNarrative } : {}),
  };
}

/**
 * Submit / re-submit mutation. The SAME `/submit` endpoint serves the first
 * submit and every later re-submit (after a reviewer doc request) — re-stamping
 * `submitted_at` is the only signal that re-enters review, so a conversation
 * never disturbs it. `errorCopy` lets the two call sites surface their own toast.
 */
function useSubmitCampaign(campaignId: string, errorCopy: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => submitCampaign(campaignId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.portal.campaign(campaignId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.portal.campaigns() });
    },
    onError: (e: Error) => toast.error(e.message || errorCopy),
  });
}

function useDraftActions(campaignId: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submit = useSubmitCampaign(campaignId, COPY.portal.draftSubmitError);
  const remove = useMutation({
    mutationFn: () => deleteCampaign(campaignId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.portal.campaigns() });
      await navigate({ to: "/portal/campaigns" });
    },
    onError: (e: Error) => toast.error(e.message || COPY.portal.draftDeleteError),
  });
  return { submit, remove };
}

function DraftActions({ campaignId }: { readonly campaignId: string }): React.JSX.Element {
  const { submit, remove } = useDraftActions(campaignId);
  function onDelete(): void {
    if (window.confirm(COPY.portal.draftDeleteConfirm)) remove.mutate();
  }
  return (
    <Alert className="rounded-xl border-border shadow-elev-1">
      <AlertTitle>{COPY.portal.draftBannerTitle}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">{COPY.portal.draftBannerBody}</p>
        <div className="flex flex-wrap gap-3">
          <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? COPY.portal.draftSubmitting : COPY.portal.draftSubmit}
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete} disabled={remove.isPending}>
            {remove.isPending ? COPY.portal.draftDeleting : COPY.portal.draftDelete}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function EvidenceSection({
  detail,
  readOnly,
}: {
  readonly detail: ClientCaseDetail;
  readonly readOnly: boolean;
}): React.JSX.Element {
  const incomplete = detail.status === "submitted" && !detail.evidence.every((e) => e.uploaded);
  return (
    <section>
      <h2 className="mb-1 text-xl font-semibold tracking-[-0.01em]">
        {COPY.portal.detailEvidenceTitle}
      </h2>
      <p className="text-sm text-muted-foreground">{COPY.portal.detailEvidenceSubtitle}</p>
      {incomplete ? (
        <Alert className="mt-4 rounded-xl border-status-warning-border bg-status-warning/40">
          <AlertTitle>{COPY.portal.detailEvidenceIncompleteTitle}</AlertTitle>
          <AlertDescription>{COPY.portal.detailEvidenceIncompleteBody}</AlertDescription>
        </Alert>
      ) : null}
      <EvidencePanel campaignId={detail.id} evidence={detail.evidence} readOnly={readOnly} />
      <SupplementaryDocs campaignId={detail.id} readOnly={readOnly} />
    </section>
  );
}

/** Scrolls the Messages section into view when navigated with `#messages` (e.g. from a notification). */
function useScrollToMessages(): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === "messages") {
      document.getElementById("messages")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [hash]);
}

function DetailBody({ detail }: { readonly detail: ClientCaseDetail }): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const evidenceReadOnly = detail.status === "approved" || detail.status === "not_approved";
  useScrollToMessages();
  const earlierRequests =
    detail.status === "needs_evidence" ? detail.reviewHistory.slice(1) : detail.reviewHistory;

  function handleEditDone(): void {
    setEditing(false);
  }

  return (
    <div className="space-y-8">
      <DetailHeader detail={detail} editing={editing} onEditToggle={() => setEditing(true)} />
      {detail.status === "draft" ? <DraftActions campaignId={detail.id} /> : null}
      {editing ? (
        <section>
          <h2 className="mb-4 text-xl font-semibold tracking-[-0.01em]">{COPY.portal.editTitle}</h2>
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
      <ReviewHistory entries={earlierRequests} />
      <Separator />
      <EvidenceSection detail={detail} readOnly={evidenceReadOnly} />
      {detail.status === "needs_evidence" ? (
        <ResubmitBar campaignId={detail.id} canResubmit={detail.canResubmit} />
      ) : null}
      <Separator />
      <section id="messages" className="scroll-mt-20 space-y-4">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">{COPY.portal.detailNotesTitle}</h2>
        <NoteThread campaignId={detail.id} />
        {detail.status === "approved" || detail.status === "not_approved" ? (
          <p className="text-sm text-muted-foreground">{COPY.portal.noteComposeDecided}</p>
        ) : (
          <ClientNoteComposer campaignId={detail.id} />
        )}
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

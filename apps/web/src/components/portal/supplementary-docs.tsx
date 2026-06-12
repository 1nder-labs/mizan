/**
 * Client "additional documents" panel — lets a campaign owner ADD supplementary
 * files beyond the three required slots (the explicit "add more, don't replace"
 * ask). Each upload appends a new `documents` row (never overwrites); the list
 * reflects every supplementary file with a view link (auth-gated raw endpoint,
 * new tab). Read-only once the case is decided.
 */
import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";
import type { DocumentSummary } from "@mizan/shared";
import { clientCampaignDocumentsQueryOptions } from "@/lib/documents-api.ts";
import { ClientDocumentViewButton } from "@/components/portal/client-document-view-button.tsx";
import { uploadEvidence } from "@/lib/portal-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { formatMediumDateTime } from "@/lib/format.ts";
import { Button } from "@/components/ui/button.tsx";

function useSupplementaryUpload(campaignId: string) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useMutation({
    mutationFn: (file: File) => uploadEvidence(campaignId, "supplementary", file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.portal.campaign(campaignId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.portal.notes(campaignId) });
    },
    onError: (error: Error) => toast.error(error.message || COPY.portal.evidenceError),
  });
  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    mutation.mutate(file);
    if (inputRef.current) inputRef.current.value = "";
  }
  return { inputRef, onFileSelected, pending: mutation.isPending };
}

function SupplementaryRow({
  campaignId,
  doc,
}: {
  readonly campaignId: string;
  readonly doc: DocumentSummary;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">
            {doc.filename || COPY.portal.supplementaryUntitled}
          </p>
          <p className="text-xs text-muted-foreground">{formatMediumDateTime(doc.uploaded_at)}</p>
        </div>
      </div>
      <ClientDocumentViewButton campaignId={campaignId} doc={doc} />
    </div>
  );
}

function AddSupplementaryButton({
  campaignId,
}: {
  readonly campaignId: string;
}): React.JSX.Element {
  const { inputRef, onFileSelected, pending } = useSupplementaryUpload(campaignId);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={onFileSelected}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={COPY.portal.supplementaryAdd}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? (
          <>
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            {COPY.portal.evidencePending}
          </>
        ) : (
          <>
            <Plus className="mr-1.5 size-3.5" />
            {COPY.portal.supplementaryAdd}
          </>
        )}
      </Button>
    </>
  );
}

export function SupplementaryDocs({
  campaignId,
  readOnly = false,
}: {
  readonly campaignId: string;
  readonly readOnly?: boolean;
}): React.JSX.Element {
  const { data } = useQuery(clientCampaignDocumentsQueryOptions(campaignId));
  const docs = (data?.documents ?? []).filter((doc) => doc.doc_kind === "supplementary");
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border shadow-elev-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/50 bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{COPY.portal.supplementaryTitle}</p>
          <p className="text-xs text-muted-foreground">{COPY.portal.supplementaryHint}</p>
        </div>
        {readOnly ? null : <AddSupplementaryButton campaignId={campaignId} />}
      </div>
      {docs.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">{COPY.portal.supplementaryEmpty}</p>
      ) : (
        <div className="divide-y divide-border/40">
          {docs.map((doc) => (
            <SupplementaryRow key={doc.id} campaignId={campaignId} doc={doc} />
          ))}
        </div>
      )}
    </div>
  );
}

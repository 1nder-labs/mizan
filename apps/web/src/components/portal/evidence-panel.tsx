/**
 * Evidence upload panel. Shows a completeness header and, for each of the three
 * required documents, why it's needed, its upload state, and an upload control.
 * Each row manages its own `useMutation` so pending state is localised per-doc.
 * The hidden input is reset after upload so re-selecting the same file re-fires
 * `onChange`. Upload buttons carry a per-document accessible name so keyboard +
 * screen-reader users know which document each control targets.
 */
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DocumentKeyEnum, type DocumentKey } from "@mizan/shared";
import type { ClientCaseDetail } from "@mizan/shared";
import { uploadEvidence } from "@/lib/portal-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY, docKindDisplay, docKindWhy, evidenceProgress } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";

interface EvidenceRowProps {
  readonly campaignId: string;
  readonly docKind: DocumentKey;
  readonly uploaded: boolean;
  readonly readOnly: boolean;
}

function useEvidenceUpload(campaignId: string, docKind: DocumentKey) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useMutation({
    mutationFn: (file: File) => uploadEvidence(campaignId, docKind, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.portal.campaign(campaignId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.portal.notes(campaignId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || COPY.portal.evidenceError);
    },
  });
  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    mutation.mutate(file);
    if (inputRef.current) inputRef.current.value = "";
  }
  return { inputRef, onFileSelected, pending: mutation.isPending };
}

function DocStatusIcon({ uploaded }: { readonly uploaded: boolean }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
        uploaded
          ? "bg-status-success text-status-success-foreground"
          : "border border-dashed border-status-neutral-border",
      )}
    >
      {uploaded ? <Check className="size-3" /> : null}
    </span>
  );
}

function UploadControl({
  campaignId,
  docKind,
  uploaded,
}: {
  readonly campaignId: string;
  readonly docKind: DocumentKey;
  readonly uploaded: boolean;
}): React.JSX.Element {
  const { inputRef, onFileSelected, pending } = useEvidenceUpload(campaignId, docKind);
  const verb = uploaded ? COPY.portal.evidenceReplace : COPY.portal.evidenceUpload;
  const accessibleName = `${verb} ${docKindDisplay(docKind)}`;
  /**
   * The button drives a sibling file input via `.click()`. The input is
   * `sr-only` (rendered but visually hidden), NOT `hidden`/`display:none` —
   * Safari refuses to open the picker for a programmatic `.click()` on a
   * `display:none` input. `tabIndex={-1}` + `aria-hidden` keep the button the
   * sole control (which carries the per-document accessible name).
   */
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
        aria-label={accessibleName}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? (
          <>
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            {COPY.portal.evidencePending}
          </>
        ) : (
          verb
        )}
      </Button>
    </>
  );
}

function EvidenceRow({
  campaignId,
  docKind,
  uploaded,
  readOnly,
}: EvidenceRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <DocStatusIcon uploaded={uploaded} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{docKindDisplay(docKind)}</p>
          <p className="text-xs text-muted-foreground">{docKindWhy(docKind)}</p>
          <p
            className={cn(
              "mt-0.5 text-xs font-medium",
              uploaded ? "text-status-success-foreground" : "text-muted-foreground",
            )}
          >
            {uploaded ? COPY.portal.evidenceUploaded : COPY.portal.evidenceRequired}
          </p>
        </div>
      </div>
      {readOnly ? null : (
        <UploadControl campaignId={campaignId} docKind={docKind} uploaded={uploaded} />
      )}
    </div>
  );
}

interface EvidencePanelProps {
  readonly campaignId: string;
  readonly evidence: ClientCaseDetail["evidence"];
  readonly readOnly?: boolean;
}

export function EvidencePanel({
  campaignId,
  evidence,
  readOnly = false,
}: EvidencePanelProps): React.JSX.Element {
  const uploadedMap: Partial<Record<DocumentKey, boolean>> = {};
  for (const item of evidence) {
    uploadedMap[item.docKind] = item.uploaded;
  }
  const uploadedCount = DocumentKeyEnum.options.filter((k) => uploadedMap[k]).length;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2.5">
        <p className="text-sm font-medium">
          {evidenceProgress(uploadedCount, DocumentKeyEnum.options.length)}
        </p>
        <p className="text-xs text-muted-foreground">
          {readOnly ? COPY.portal.evidenceDecided : COPY.portal.evidenceHint}
        </p>
      </div>
      <div className="divide-y">
        {DocumentKeyEnum.options.map((docKind) => (
          <EvidenceRow
            key={docKind}
            campaignId={campaignId}
            docKind={docKind}
            uploaded={uploadedMap[docKind] ?? false}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

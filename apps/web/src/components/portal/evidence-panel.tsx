/**
 * Evidence upload panel. For each of the three required documents, shows
 * the upload state and a file input button. Each document row manages its
 * own `useMutation` so pending state is localised per-doc (not a shared
 * single-mutation with docKind tracking). The hidden input is reset after
 * upload so re-selecting the same file re-fires `onChange`.
 */
import { useRef } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DocumentKeyEnum, type DocumentKey } from "@mizan/shared";
import type { ClientCaseDetail } from "@mizan/shared";
import { uploadEvidence } from "@/lib/portal-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY, docKindDisplay } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";

interface EvidenceRowProps {
  readonly campaignId: string;
  readonly docKind: DocumentKey;
  readonly uploaded: boolean;
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
    onError: () => {
      toast.error(COPY.portal.evidenceError);
    },
  });
  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    mutation.mutate(file);
    if (inputRef.current) inputRef.current.value = "";
  }
  return { inputRef, handleChange, pending: mutation.isPending };
}

function EvidenceRow({ campaignId, docKind, uploaded }: EvidenceRowProps): React.JSX.Element {
  const { inputRef, handleChange, pending } = useEvidenceUpload(campaignId, docKind);

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/40 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{docKindDisplay(docKind)}</p>
        <p className="text-xs text-muted-foreground">
          {uploaded ? COPY.portal.evidenceUploaded : COPY.portal.evidenceMissing}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleChange}
        aria-label={docKindDisplay(docKind)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? (
          <>
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            {COPY.portal.evidencePending}
          </>
        ) : uploaded ? (
          COPY.portal.evidenceReplace
        ) : (
          COPY.portal.evidenceUpload
        )}
      </Button>
    </div>
  );
}

interface EvidencePanelProps {
  readonly campaignId: string;
  readonly evidence: ClientCaseDetail["evidence"];
}

export function EvidencePanel({ campaignId, evidence }: EvidencePanelProps): React.JSX.Element {
  const uploadedMap: Partial<Record<DocumentKey, boolean>> = {};
  for (const item of evidence) {
    uploadedMap[item.docKind] = item.uploaded;
  }

  return (
    <div>
      <p className="mt-1 text-xs text-muted-foreground">{COPY.portal.evidenceHint}</p>
      <div className="mt-3">
        {DocumentKeyEnum.options.map((docKind) => (
          <EvidenceRow
            key={docKind}
            campaignId={campaignId}
            docKind={docKind}
            uploaded={uploadedMap[docKind] ?? false}
          />
        ))}
      </div>
    </div>
  );
}

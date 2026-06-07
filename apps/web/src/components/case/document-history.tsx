/**
 * Reviewer-facing document history + supplementary list, shown beneath the three
 * current-version tiles in `DocumentsPanel`. Surfaces what the tiles can't: the
 * client's supplementary uploads and any prior versions of a named slot. Each
 * row opens the same `DocumentViewerDialog`, resolved through the by-id URL
 * endpoint. Renders nothing when there are no extras.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import type { DocumentSummary } from "@mizan/shared";
import { caseDocumentsQueryOptions, fetchCaseDocumentUrl } from "@/lib/documents-api.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { docKindDisplay } from "@/lib/doc-kind-copy.ts";
import { formatMediumDateTime } from "@/lib/format.ts";
import { Button } from "@/components/ui/button.tsx";
import { DocumentViewerDialog } from "./document-viewer-dialog.tsx";

function rowLabel(doc: DocumentSummary): string {
  if (doc.doc_kind === "supplementary") return doc.filename || COPY.documents.supplementaryLabel;
  return `${docKindDisplay(doc.doc_kind)} · ${COPY.documents.previousVersion}`;
}

function ExtraRow({
  doc,
  onOpen,
}: {
  readonly doc: DocumentSummary;
  readonly onOpen: (doc: DocumentSummary) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{rowLabel(doc)}</p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {formatMediumDateTime(doc.uploaded_at)}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onOpen(doc)}>
        {COPY.documents.openInTab}
      </Button>
    </div>
  );
}

function ByIdDialog({
  caseId,
  doc,
  open,
  onOpenChange,
}: {
  readonly caseId: string;
  readonly doc: DocumentSummary | null;
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
}): React.JSX.Element | null {
  const query = useQuery({
    queryKey: ["document-url-by-id", caseId, doc?.id ?? ""],
    queryFn: () => fetchCaseDocumentUrl(caseId, doc?.id ?? ""),
    enabled: open && doc !== null,
    staleTime: 240_000,
    retry: 0,
  });
  if (!doc) return null;
  return (
    <DocumentViewerDialog
      open={open}
      onOpenChange={onOpenChange}
      url={query.data?.url ?? null}
      title={rowLabel(doc)}
      description={query.isPending ? COPY.documents.loadingLabel : ""}
      fileName={doc.filename || doc.doc_kind}
      contentType={query.data?.contentType ?? doc.content_type}
    />
  );
}

export function DocumentHistory({ caseId }: { readonly caseId: string }): React.JSX.Element | null {
  const { data } = useQuery(caseDocumentsQueryOptions(caseId));
  const [active, setActive] = useState<DocumentSummary | null>(null);
  const [open, setOpen] = useState(false);
  const extras = (data?.documents ?? []).filter(
    (doc) => doc.doc_kind === "supplementary" || !doc.is_current,
  );
  if (extras.length === 0) return null;
  return (
    <div className="border-t border-border/50 px-2 py-3">
      <p className="flex items-center gap-2 px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <Layers className="size-3.5" />
        {COPY.documents.historyTitle}
      </p>
      <div className="divide-y divide-border/30">
        {extras.map((doc) => (
          <ExtraRow
            key={doc.id}
            doc={doc}
            onOpen={(next) => {
              setActive(next);
              setOpen(true);
            }}
          />
        ))}
      </div>
      <ByIdDialog
        caseId={caseId}
        doc={active}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setActive(null);
        }}
      />
    </div>
  );
}

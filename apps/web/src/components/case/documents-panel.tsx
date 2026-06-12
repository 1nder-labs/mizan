/**
 * Documents panel — three clickable tiles per case (creator id, bank
 * statement, category doc). Each tile carries a doc-type-specific
 * color treatment so a reviewer can scan by glance, not by label.
 * Tiles open a `DocumentViewerDialog` backed by a short-TTL presigned
 * R2 URL. Tiles disable cleanly when the overlay is missing.
 */
import { useEffect, useState } from "react";
import { FileText, IdCard, Landmark, LoaderCircle, ScrollText } from "lucide-react";
import { toast } from "sonner";
import type { DocumentKey } from "@mizan/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useDocumentUrl } from "@/hooks/use-document-url.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";
import { DocumentViewerDialog } from "./document-viewer-dialog.tsx";
import { documentDownloadName } from "./document-preview.tsx";
import { DocumentHistory } from "./document-history.tsx";

interface DocumentsPanelProps {
  readonly caseId: string;
  readonly hasOverlay: boolean;
}

interface TileSpec {
  readonly docKey: DocumentKey;
  readonly label: string;
  readonly icon: typeof FileText;
  readonly tone: string;
}

const TILES: readonly TileSpec[] = [
  {
    docKey: "creator_id",
    label: COPY.documents.creatorIdLabel,
    icon: IdCard,
    tone: "bg-muted text-muted-foreground",
  },
  {
    docKey: "bank_statement",
    label: COPY.documents.bankStatementLabel,
    icon: Landmark,
    tone: "bg-muted text-muted-foreground",
  },
  {
    docKey: "category_doc",
    label: COPY.documents.categoryDocLabel,
    icon: ScrollText,
    tone: "bg-muted text-muted-foreground",
  },
];

/** Inner label block for a document tile row. */
function TileLabel({
  spec,
  active,
  disabled,
}: {
  readonly spec: TileSpec;
  readonly active: boolean;
  readonly disabled: boolean;
}): React.JSX.Element {
  const Icon = spec.icon;
  return (
    <>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", spec.tone)}>
        <Icon className="size-3.5" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span
          className={cn(
            "text-sm font-medium",
            active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
          )}
        >
          {spec.label}
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {disabled ? COPY.documents.panelEmpty : COPY.documents.openInTab}
        </span>
      </span>
    </>
  );
}

function DocumentTileButton({
  spec,
  disabled,
  active,
  onClick,
}: {
  readonly spec: TileSpec;
  readonly disabled: boolean;
  readonly active: boolean;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-md px-3 py-2.5",
        "pl-4 text-left transition-colors",
        "before:absolute before:inset-y-2 before:left-0 before:w-[3px]",
        "before:rounded-r-full before:transition-colors",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        active ? "bg-muted/60 before:bg-foreground" : "before:bg-transparent hover:bg-muted/30",
        !disabled && !active && "hover:before:bg-foreground/30",
      )}
    >
      <TileLabel spec={spec} active={active} disabled={disabled} />
    </button>
  );
}

function ActiveDialog({
  caseId,
  docKey,
  open,
  onOpenChange,
}: {
  readonly caseId: string;
  readonly docKey: DocumentKey | null;
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
}): React.JSX.Element | null {
  const query = useDocumentUrl(caseId, docKey ?? "creator_id", open && docKey !== null);
  const errorMessage = query.isError ? query.error.message : null;
  useEffect(() => {
    if (errorMessage) toast.error(COPY.documents.loadError, { description: errorMessage });
  }, [errorMessage]);
  if (!docKey) return null;
  const spec = TILES.find((entry) => entry.docKey === docKey);
  const label = spec?.label ?? "Document";
  const description = query.isPending ? COPY.documents.loadingLabel : "";
  return (
    <DocumentViewerDialog
      open={open}
      onOpenChange={onOpenChange}
      url={query.data?.url ?? null}
      title={label}
      description={description}
      fileName={documentDownloadName(docKey, query.data?.contentType ?? null)}
      contentType={query.data?.contentType ?? null}
    />
  );
}

export function DocumentsPanel({ caseId, hasOverlay }: DocumentsPanelProps): React.JSX.Element {
  const [activeKey, setActiveKey] = useState<DocumentKey | null>(null);
  const [open, setOpen] = useState(false);
  const onOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) setActiveKey(null);
  };
  return (
    <Card className="rounded-xl border-border/60 bg-card shadow-elev-1">
      <CardHeader className="border-b border-border/50 px-5 py-4">
        <CardTitle
          className={cn(
            "flex items-center gap-2 text-[10px] font-medium",
            "uppercase tracking-[0.18em] text-muted-foreground",
          )}
        >
          <FileText className="size-3.5" />
          {COPY.documents.panelTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 px-5 py-3">
        {hasOverlay ? null : (
          <p
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-[10px]",
              "uppercase tracking-[0.14em] text-muted-foreground",
            )}
          >
            <LoaderCircle className="size-3 animate-pulse" /> {COPY.documents.panelEmpty}
          </p>
        )}
        {TILES.map((spec) => (
          <DocumentTileButton
            key={spec.docKey}
            spec={spec}
            disabled={!hasOverlay}
            active={open && activeKey === spec.docKey}
            onClick={() => {
              setActiveKey(spec.docKey);
              setOpen(true);
            }}
          />
        ))}
        <DocumentHistory caseId={caseId} />
      </CardContent>
      <ActiveDialog caseId={caseId} docKey={activeKey} open={open} onOpenChange={onOpenChange} />
    </Card>
  );
}

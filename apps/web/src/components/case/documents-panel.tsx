/**
 * Documents panel — three clickable tiles per case (creator id, bank
 * statement, category doc). Each tile carries a doc-type-specific
 * color treatment so a reviewer can scan by glance, not by label.
 * Tiles open a `DocumentViewerDialog` backed by a short-TTL presigned
 * R2 URL. Tiles disable cleanly when the overlay is missing.
 */
import { useState } from "react";
import { FileText, IdCard, Landmark, Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import type { DocumentKey } from "@mizan/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useDocumentUrl } from "@/hooks/use-document-url.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";
import { DocumentViewerDialog } from "./document-viewer-dialog.tsx";

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
    tone: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60",
  },
  {
    docKey: "bank_statement",
    label: COPY.documents.bankStatementLabel,
    icon: Landmark,
    tone: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60",
  },
  {
    docKey: "category_doc",
    label: COPY.documents.categoryDocLabel,
    icon: ScrollText,
    tone: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/60",
  },
];

function deriveFileName(docKey: DocumentKey): string {
  return `${docKey.replace(/_/g, "-")}.pdf`;
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
  const Icon = spec.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "lift-on-hover group flex w-full items-center gap-3 rounded-lg border border-border/50 bg-card p-3 text-left",
        "hover:border-foreground/30 hover:shadow-elev-1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-border/50",
        active && "border-foreground/40 bg-muted/30 shadow-elev-1",
      )}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-md", spec.tone)}>
        <Icon className="size-4" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{spec.label}</span>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {disabled ? COPY.documents.panelEmpty : COPY.documents.openInTab}
        </span>
      </span>
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
  if (!docKey) return null;
  const spec = TILES.find((entry) => entry.docKey === docKey);
  const label = spec?.label ?? "Document";
  if (query.isError) {
    toast.error(COPY.documents.loadError, { description: query.error.message });
  }
  const description = query.isPending ? COPY.documents.loadingLabel : "";
  return (
    <DocumentViewerDialog
      open={open}
      onOpenChange={onOpenChange}
      url={query.data?.url ?? null}
      title={label}
      description={description}
      fileName={deriveFileName(docKey)}
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
    <Card className="border-border/70 bg-card/80 shadow-elev-1">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4 text-muted-foreground" />
          {COPY.documents.panelTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {hasOverlay ? null : (
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Loader2 className="size-3.5 animate-pulse" /> {COPY.documents.panelEmpty}
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
      </CardContent>
      <ActiveDialog caseId={caseId} docKey={activeKey} open={open} onOpenChange={onOpenChange} />
    </Card>
  );
}

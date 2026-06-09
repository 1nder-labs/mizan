/**
 * `photo_dup` signal body — image-authenticity read of both document images: the
 * vision LLM's AI-generation likelihood + tampering assessment (from the same
 * extraction call that read the image), and the real EXIF capture metadata
 * parsed from the bytes. Thumbnails come from the existing R2 presigned-URL hook
 * so signal evidence rides the same auth-gated flow as the documents panel.
 */
import type {
  AiGeneratedLikelihood,
  DocumentUrlResponse,
  PhotoAssetSignal,
  PhotoSignalPayload,
} from "@mizan/shared";
import { useState } from "react";
import { FileText } from "lucide-react";
import { useDocumentUrl } from "@/hooks/use-document-url.ts";
import { cn } from "@/lib/utils.ts";
import { classifyDocumentKind } from "../document-kind.ts";
import { DocumentViewerDialog } from "../document-viewer-dialog.tsx";

type DocPreview = Pick<DocumentUrlResponse, "url" | "contentType">;
type PhotoDocKey = "creator_id" | "category_doc";

/** Download file name for the viewer: `creator-id.pdf`, `category-doc.png`, … */
function docFileName(docKey: PhotoDocKey, contentType: string | null): string {
  const subtype = contentType
    ?.toLowerCase()
    .split("/")
    .at(1)
    ?.replace(/[^a-z0-9]/g, "");
  const ext = subtype && subtype.length > 0 ? subtype : "bin";
  return `${docKey.replace(/_/g, "-")}.${ext}`;
}

/**
 * 80×80 document preview. Image documents render inline; PDFs — and any other
 * non-image content type — render a file-type placeholder, because a PDF cannot
 * load into an `<img>` and would otherwise show a broken-image box. The kind is
 * read from the stored content type, never the URL path (raw-serve URLs carry
 * no extension). Exported for the render regression test.
 */
export function DocThumbnail({
  preview,
  label,
}: {
  readonly preview: DocPreview | null;
  readonly label: string;
}): React.JSX.Element {
  return (
    <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md border border-border/60 bg-background">
      {preview === null ? (
        <span className="text-[10px] text-muted-foreground">loading…</span>
      ) : classifyDocumentKind(preview.contentType) === "image" ? (
        <img src={preview.url} alt={label} className="size-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <FileText className="size-6" aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-wide">PDF</span>
        </div>
      )}
    </div>
  );
}

const LIKELIHOOD_LABEL: Record<AiGeneratedLikelihood, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  very_high: "Very high",
};

/** AI-gen likelihood low → success tone, high → destructive. */
function likelihoodTone(level: AiGeneratedLikelihood): string {
  if (level === "low") return "text-status-success-foreground";
  if (level === "medium") return "text-status-warning-foreground";
  return "text-status-destructive-foreground";
}

function MetaRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

/**
 * Clickable thumbnail that opens the same `DocumentViewerDialog` the Documents
 * tab uses, so a PDF (or image) document opens in the full PDF/image viewer
 * rather than only showing the small inline preview.
 */
function DocPreviewButton({
  caseId,
  docKey,
  label,
}: {
  readonly caseId: string;
  readonly docKey: PhotoDocKey;
  readonly label: string;
}): React.JSX.Element {
  const query = useDocumentUrl(caseId, docKey, true);
  const [open, setOpen] = useState(false);
  const preview = query.data ?? null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${label}`}
        className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <DocThumbnail preview={preview} label={label} />
      </button>
      <DocumentViewerDialog
        open={open}
        onOpenChange={setOpen}
        url={preview?.url ?? null}
        title={label}
        description=""
        fileName={docFileName(docKey, preview?.contentType ?? null)}
        contentType={preview?.contentType ?? null}
      />
    </>
  );
}

function AuthenticityHeader({
  caseId,
  docKey,
  label,
  authenticity,
}: {
  readonly caseId: string;
  readonly docKey: PhotoDocKey;
  readonly label: string;
  readonly authenticity: PhotoAssetSignal["authenticity"];
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <DocPreviewButton caseId={caseId} docKey={docKey} label={label} />
      <div className="min-w-0 space-y-1.5 text-sm">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">
          AI-generated likelihood:{" "}
          <span className={cn("font-medium", likelihoodTone(authenticity.ai_generated_likelihood))}>
            {LIKELIHOOD_LABEL[authenticity.ai_generated_likelihood]}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Tampering signs:{" "}
          <span className="text-foreground">
            {authenticity.shows_tampering_signs ? "Detected" : "None detected"}
          </span>
        </p>
      </div>
    </div>
  );
}

function ExifRows({ exif }: { readonly exif: PhotoAssetSignal["exif"] }): React.JSX.Element {
  return (
    <div className="space-y-1 border-t border-border/40 pt-2">
      <MetaRow
        label="Capture metadata (EXIF)"
        value={exif.has_capture_metadata ? "Present" : "None"}
      />
      {exif.camera_make !== null || exif.camera_model !== null ? (
        <MetaRow
          label="Camera"
          value={[exif.camera_make, exif.camera_model].filter((v) => v !== null).join(" ")}
        />
      ) : null}
      {exif.captured_at !== null ? <MetaRow label="Captured" value={exif.captured_at} /> : null}
      <MetaRow label="GPS location" value={exif.has_gps ? "Present" : "None"} />
    </div>
  );
}

function PhotoAssetCard({
  caseId,
  docKey,
  label,
  asset,
}: {
  readonly caseId: string;
  readonly docKey: "creator_id" | "category_doc";
  readonly label: string;
  readonly asset: PhotoAssetSignal;
}): React.JSX.Element {
  return (
    <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-3 shadow-elev-1">
      <AuthenticityHeader
        caseId={caseId}
        docKey={docKey}
        label={label}
        authenticity={asset.authenticity}
      />
      <p className="rounded-lg border border-border/40 bg-background/40 p-2.5 text-xs leading-relaxed text-foreground/90">
        {asset.authenticity.assessment}
      </p>
      <ExifRows exif={asset.exif} />
    </div>
  );
}

export function PhotoDupBody({
  caseId,
  payload,
}: {
  readonly caseId: string;
  readonly payload: PhotoSignalPayload;
}): React.JSX.Element {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <PhotoAssetCard
        caseId={caseId}
        docKey="creator_id"
        label="Creator ID photo"
        asset={payload.creator_id}
      />
      <PhotoAssetCard
        caseId={caseId}
        docKey="category_doc"
        label="Category document"
        asset={payload.category_doc}
      />
    </div>
  );
}

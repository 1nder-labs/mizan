/**
 * `photo_dup` signal body — image-authenticity read of both document images: the
 * vision LLM's AI-generation likelihood + tampering assessment (from the same
 * extraction call that read the image), and the real EXIF capture metadata
 * parsed from the bytes. Thumbnails come from the existing R2 presigned-URL hook
 * so signal evidence rides the same auth-gated flow as the documents panel.
 */
import type { AiGeneratedLikelihood, PhotoAssetSignal, PhotoSignalPayload } from "@mizan/shared";
import { useDocumentUrl } from "@/hooks/use-document-url.ts";
import { cn } from "@/lib/utils.ts";

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

function AuthenticityHeader({
  caseId,
  docKey,
  label,
  authenticity,
}: {
  readonly caseId: string;
  readonly docKey: "creator_id" | "category_doc";
  readonly label: string;
  readonly authenticity: PhotoAssetSignal["authenticity"];
}): React.JSX.Element {
  const query = useDocumentUrl(caseId, docKey, true);
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md border border-border/60 bg-background">
        {query.data ? (
          <img src={query.data.url} alt={label} className="size-full object-cover" />
        ) : (
          <span className="text-[10px] text-muted-foreground">loading…</span>
        )}
      </div>
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

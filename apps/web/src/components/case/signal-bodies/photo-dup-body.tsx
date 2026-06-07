/**
 * `photo_dup` signal body — surfaces reverse-image hits + AI-gen
 * probability for both attached photos. Renders thumbnails via the
 * existing R2 presigned URL hook so the same auth-gated flow drives
 * signal evidence as drives the documents panel.
 */
import type { PhotoAssetSignal, PhotoSignalPayload } from "@mizan/shared";
import { useDocumentUrl } from "@/hooks/use-document-url.ts";

interface PhotoDupBodyProps {
  readonly caseId: string;
  readonly payload: PhotoSignalPayload;
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
  const query = useDocumentUrl(caseId, docKey, true);
  return (
    <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-3 shadow-elev-1">
      <div className="flex items-start gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md border border-border/60 bg-background">
          {query.data ? (
            <img src={query.data.url} alt={label} className="size-full object-cover" />
          ) : (
            <span className="text-[10px] text-muted-foreground">loading…</span>
          )}
        </div>
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">
            Reverse-image hits:{" "}
            <span className="font-numeric text-foreground">{asset.reverseImage.hits.length}</span>
          </p>
          <p className="text-xs text-muted-foreground capitalize">
            AI-gen probability: {asset.aiGen.probability.replace(/_/g, " ")}
          </p>
        </div>
      </div>
      {asset.reverseImage.hits.length > 0 ? (
        <ul className="space-y-1 border-t border-border/40 pt-2 text-xs text-muted-foreground">
          {asset.reverseImage.hits.slice(0, 3).map((hit) => (
            <li key={hit.url} className="truncate">
              <span className="font-numeric text-foreground">
                {(hit.confidence * 100).toFixed(0)}%
              </span>{" "}
              · {hit.url}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PhotoDupBody({ caseId, payload }: PhotoDupBodyProps): React.JSX.Element {
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

/**
 * Shared reviewer-side document-preview primitives — the thumbnail, the
 * download-name deriver, and the clickable thumbnail that opens the full
 * `DocumentViewerDialog` via the R2 presigned-URL hook. Extracted so the
 * documents panel and every signal body that shows a document (photo_dup today,
 * any future doc-bearing signal) share ONE preview stack instead of forking
 * `docFileName` / thumbnail / dialog-open flow per component.
 */
import { useState } from "react";
import { FileText } from "lucide-react";
import type { DocumentKey, DocumentUrlResponse } from "@mizan/shared";
import { useDocumentUrl } from "@/hooks/use-document-url.ts";
import { Button } from "@/components/ui/button.tsx";
import { classifyDocumentKind } from "./document-kind.ts";
import { DocumentViewerDialog } from "./document-viewer-dialog.tsx";

export type DocPreview = Pick<DocumentUrlResponse, "url" | "contentType">;

/**
 * Download file name for the viewer, derived from the stored content type:
 * `creator-id.pdf`, `category-doc.png`, … The base is a doc key / stem
 * (underscores become hyphens); the extension comes from the MIME subtype, never
 * the URL path (raw-serve URLs carry no extension). Falls back to `.bin`.
 */
export function documentDownloadName(base: string, contentType: string | null): string {
  const subtype = contentType
    ?.toLowerCase()
    .split("/")
    .at(1)
    ?.replace(/[^a-z0-9]/g, "");
  const ext = subtype && subtype.length > 0 ? subtype : "bin";
  return `${base.replace(/_/g, "-")}.${ext}`;
}

/**
 * 80×80 document preview. Image documents render inline; PDFs — and any other
 * non-image content type — render a file-type placeholder, because a PDF cannot
 * load into an `<img>` and would otherwise show a broken-image box. The kind is
 * read from the stored content type, never the URL path. Exported for the render
 * regression test.
 */
export function DocumentThumbnail({
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

/**
 * Clickable 80×80 thumbnail that opens the same `DocumentViewerDialog` the
 * Documents tab uses, so a PDF (or image) opens in the full viewer rather than
 * only the inline preview. Backed by the R2 presigned-URL hook keyed on docKey.
 */
export function DocumentPreviewButton({
  caseId,
  docKey,
  label,
}: {
  readonly caseId: string;
  readonly docKey: DocumentKey;
  readonly label: string;
}): React.JSX.Element {
  const query = useDocumentUrl(caseId, docKey, true);
  const [open, setOpen] = useState(false);
  const preview = query.data ?? null;
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`Open ${label}`}
        className="h-auto rounded-md p-0 transition-opacity hover:bg-transparent hover:opacity-80"
      >
        <DocumentThumbnail preview={preview} label={label} />
      </Button>
      <DocumentViewerDialog
        open={open}
        onOpenChange={setOpen}
        url={preview?.url ?? null}
        title={label}
        description=""
        fileName={documentDownloadName(docKey, preview?.contentType ?? null)}
        contentType={preview?.contentType ?? null}
      />
    </>
  );
}

/**
 * PDF viewer component — rendered inside `<DocumentViewerDialog>` and
 * `React.lazy`-loaded so the ~600 KB react-pdf chunk only fetches on
 * first open. The `Document` options object is a module-level
 * constant; recreating it per render triggers react-pdf's well-known
 * infinite-refetch trap.
 *
 * cmap + standard font assets resolve from the jsdelivr CDN at the
 * exact pdfjs version we ship, so PDFs containing Arabic / Indonesian
 * / Urdu glyphs render correctly without vendoring the asset directory.
 */
import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ZoomIn, ZoomOut } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import { toast } from "sonner";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button.tsx";
import { COPY } from "@/lib/copy-constants.ts";

const DOCUMENT_OPTIONS = {
  cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
  standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
} as const;

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.25;

/** Stable loading indicator element — hoisted to avoid recreating on each render. */
const PDF_LOADING_NODE = (
  <p className="text-center text-sm text-muted-foreground">{COPY.documents.loadingLabel}</p>
);

/** Stable error indicator element — hoisted to avoid recreating on each render. */
const PDF_ERROR_NODE = (
  <p className="text-center text-sm text-destructive">{COPY.documents.loadError}</p>
);

interface PdfViewerProps {
  readonly url: string;
  readonly fileName: string;
}

function clampScale(next: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(next * 100) / 100));
}

function PageNav({
  pageNumber,
  numPages,
  onPrev,
  onNext,
}: {
  readonly pageNumber: number;
  readonly numPages: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={onPrev}
        disabled={pageNumber <= 1}
        aria-label={COPY.documents.pdfPrevPage}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-xs tabular text-muted-foreground">
        {COPY.documents.pdfPageOf(pageNumber, numPages || 1)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onNext}
        disabled={pageNumber >= numPages}
        aria-label={COPY.documents.pdfNextPage}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

function ZoomControls({
  scale,
  onZoomOut,
  onZoomIn,
  onOpenInTab,
}: {
  readonly scale: number;
  readonly onZoomOut: () => void;
  readonly onZoomIn: () => void;
  readonly onOpenInTab: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={onZoomOut}
        disabled={scale <= MIN_SCALE}
        aria-label={COPY.documents.pdfZoomOut}
      >
        <ZoomOut className="size-4" />
      </Button>
      <span className="text-xs tabular text-muted-foreground">{Math.round(scale * 100)}%</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onZoomIn}
        disabled={scale >= MAX_SCALE}
        aria-label={COPY.documents.pdfZoomIn}
      >
        <ZoomIn className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onOpenInTab} aria-label={COPY.documents.openInTab}>
        <ExternalLink className="size-4" />
      </Button>
    </div>
  );
}

function PdfControls(props: {
  readonly pageNumber: number;
  readonly numPages: number;
  readonly scale: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onZoomOut: () => void;
  readonly onZoomIn: () => void;
  readonly onOpenInTab: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
      <PageNav
        pageNumber={props.pageNumber}
        numPages={props.numPages}
        onPrev={props.onPrev}
        onNext={props.onNext}
      />
      <ZoomControls
        scale={props.scale}
        onZoomOut={props.onZoomOut}
        onZoomIn={props.onZoomIn}
        onOpenInTab={props.onOpenInTab}
      />
    </div>
  );
}

function PdfBody({
  url,
  pageNumber,
  scale,
  fileName,
  onLoadSuccess,
  onLoadError,
}: {
  readonly url: string;
  readonly pageNumber: number;
  readonly scale: number;
  readonly fileName: string;
  readonly onLoadSuccess: (info: { numPages: number }) => void;
  readonly onLoadError: (error: Error) => void;
}): React.JSX.Element {
  const file = useMemo(() => ({ url }), [url]);
  return (
    <div className="flex-1 overflow-auto bg-muted/20 p-4">
      <Document
        file={file}
        options={DOCUMENT_OPTIONS}
        onLoadSuccess={onLoadSuccess}
        onLoadError={onLoadError}
        loading={PDF_LOADING_NODE}
        error={PDF_ERROR_NODE}
        aria-label={fileName}
      >
        <Page
          pageNumber={pageNumber}
          scale={scale}
          renderAnnotationLayer={false}
          renderTextLayer={false}
        />
      </Document>
    </div>
  );
}

export default function PdfViewer({ url, fileName }: PdfViewerProps): React.JSX.Element {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const onLoadSuccess = useCallback(
    ({ numPages: total }: { numPages: number }) => setNumPages(total),
    [],
  );
  const onLoadError = useCallback((error: Error) => {
    toast.error(COPY.documents.loadError, { description: error.message });
  }, []);
  const openInTab = useCallback(() => window.open(url, "_blank", "noopener,noreferrer"), [url]);
  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-md border border-border/60 bg-background">
      <PdfControls
        pageNumber={pageNumber}
        numPages={numPages}
        scale={scale}
        onPrev={() => setPageNumber((current) => Math.max(1, current - 1))}
        onNext={() => setPageNumber((current) => Math.min(numPages, current + 1))}
        onZoomOut={() => setScale((current) => clampScale(current - SCALE_STEP))}
        onZoomIn={() => setScale((current) => clampScale(current + SCALE_STEP))}
        onOpenInTab={openInTab}
      />
      <PdfBody
        url={url}
        pageNumber={pageNumber}
        scale={scale}
        fileName={fileName}
        onLoadSuccess={onLoadSuccess}
        onLoadError={onLoadError}
      />
    </div>
  );
}

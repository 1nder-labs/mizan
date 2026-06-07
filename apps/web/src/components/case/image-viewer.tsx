/**
 * Image viewer — click toggles a 2× scale on desktop. Touch devices
 * inherit native pinch-zoom because the container sets
 * `touch-action: pinch-zoom` and `overflow: auto`.
 *
 * Download anchor exposes the presigned R2 URL directly. The 300 s TTL
 * bounds the leak window — see plan Risks table for the trade-off
 * versus a server-proxied download.
 */
import { useState } from "react";
import { ArrowUpRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";

interface ImageViewerProps {
  readonly url: string;
  readonly alt: string;
  readonly fileName: string;
}

export function ImageViewer({ url, alt, fileName }: ImageViewerProps): React.JSX.Element {
  const [zoomed, setZoomed] = useState(false);
  return (
    <div
      className={cn(
        "flex h-[70vh] flex-col overflow-hidden",
        "rounded-lg border border-border/60 bg-background",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-end gap-1",
          "border-b border-border/60 bg-muted/30 px-3 py-2",
        )}
      >
        <Button asChild variant="ghost" size="sm" aria-label={COPY.documents.openInTab}>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ArrowUpRight className="size-4" />
          </a>
        </Button>
        <Button asChild variant="ghost" size="sm" aria-label={COPY.documents.downloadLabel}>
          <a href={url} download={fileName} rel="noopener noreferrer">
            <Download className="size-4" />
          </a>
        </Button>
      </div>
      <button
        type="button"
        className="flex-1 cursor-zoom-in overflow-auto bg-muted/20 p-4 [touch-action:pinch-zoom]"
        onClick={() => setZoomed((current) => !current)}
        aria-label={zoomed ? "Reset zoom" : "Zoom in"}
      >
        <img
          src={url}
          alt={alt}
          className="mx-auto block max-w-full select-none transition-transform"
          style={{ transform: zoomed ? "scale(2)" : "scale(1)", transformOrigin: "top center" }}
        />
      </button>
    </div>
  );
}

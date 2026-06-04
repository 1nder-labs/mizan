/**
 * Document viewer dialog — picks between PDF viewer (React.lazy) and
 * image viewer based on a simple URL-path sniff. The lazy boundary
 * means the ~600 KB react-pdf chunk only fetches on the first PDF
 * dialog open; image-only sessions never pay the cost.
 *
 * Focus management: the underlying Radix Dialog handles focus trap +
 * return-to-trigger automatically. Lazy fallback renders a centered
 * loading line while the chunk arrives.
 */
import { Suspense, lazy, useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { COPY } from "@/lib/copy-constants.ts";
import { ImageViewer } from "./image-viewer.tsx";
import { classifyDocumentKind } from "./document-kind.ts";

const PdfViewer = lazy(() => import("./pdf-viewer.tsx"));

interface DocumentViewerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly url: string | null;
  readonly title: string;
  readonly description: string;
  readonly fileName: string;
  readonly contentType: string | null;
}

function ViewerBody({
  url,
  fileName,
  title,
  contentType,
}: {
  readonly url: string | null;
  readonly fileName: string;
  readonly title: string;
  readonly contentType: string | null;
}): React.JSX.Element {
  if (!url) {
    return (
      <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> {COPY.documents.loadingLabel}
      </div>
    );
  }
  const kind = classifyDocumentKind(contentType);
  if (kind === "pdf") {
    return (
      <Suspense
        fallback={
          <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> {COPY.documents.loadingLabel}
          </div>
        }
      >
        <PdfViewer url={url} fileName={fileName} />
      </Suspense>
    );
  }
  return <ImageViewer url={url} alt={title} fileName={fileName} />;
}

export function DocumentViewerDialog({
  open,
  onOpenChange,
  url,
  title,
  description,
  fileName,
  contentType,
}: DocumentViewerDialogProps): React.JSX.Element {
  const body = useMemo(
    () => <ViewerBody url={url} fileName={fileName} title={title} contentType={contentType} />,
    [url, fileName, title, contentType],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>{title}</DialogTitle>
          {description.length > 0 ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="px-4 pb-4">{body}</div>
      </DialogContent>
    </Dialog>
  );
}

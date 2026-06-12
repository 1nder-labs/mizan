/**
 * Client-side "View" button for a campaign document. Opens the SAME
 * `DocumentViewerDialog` the reviewer uses (PDF / image inline), backed by the
 * auth-gated same-origin `/raw` path — no new tab, no presign. The raw URL is
 * only supplied once the dialog opens so the lazy PDF chunk loads on demand.
 */
import { useState } from "react";
import { Eye } from "lucide-react";
import type { DocumentSummary } from "@mizan/shared";
import { Button } from "@/components/ui/button.tsx";
import { DocumentViewerDialog } from "@/components/case/document-viewer-dialog.tsx";
import { clientDocumentRawPath } from "@/lib/documents-api.ts";
import { COPY } from "@/lib/copy-constants.ts";

export function ClientDocumentViewButton({
  campaignId,
  doc,
  label,
}: {
  readonly campaignId: string;
  readonly doc: DocumentSummary;
  readonly label?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const title = doc.filename || (label ?? COPY.portal.supplementaryView);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${COPY.portal.supplementaryView} ${title}`}
        onClick={() => setOpen(true)}
      >
        <Eye className="mr-1.5 size-3.5" />
        {COPY.portal.supplementaryView}
      </Button>
      <DocumentViewerDialog
        open={open}
        onOpenChange={setOpen}
        url={open ? clientDocumentRawPath(campaignId, doc.id) : null}
        title={title}
        description=""
        fileName={doc.filename}
        contentType={doc.content_type}
      />
    </>
  );
}

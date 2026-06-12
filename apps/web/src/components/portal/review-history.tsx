/**
 * Expandable timeline of the reviewer's PAST document requests on the client
 * portal. The current request (when the case still needs evidence) is shown
 * prominently by the organizer-ask card; this collapses the earlier ones behind
 * a toggle so the client can revisit what was asked before without crowding the
 * active step. Renders nothing when there is no prior request.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ClientReviewRequest } from "@mizan/shared";
import { COPY } from "@/lib/copy-constants.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";

function RequestEntry({ entry }: { readonly entry: ClientReviewRequest }): React.JSX.Element {
  return (
    <li className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3.5">
      <p className="font-mono font-numeric text-[11px] uppercase tracking-wide text-muted-foreground">
        {new Date(entry.at).toLocaleString()}
      </p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{entry.message}</p>
      {entry.missingItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.missingItems.map((item) => (
            <Badge key={item} variant="outline" className="font-normal">
              {item}
            </Badge>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function ReviewHistory({
  entries,
}: {
  readonly entries: readonly ClientReviewRequest[];
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <section className="space-y-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        className="h-auto gap-1.5 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {open ? COPY.portal.reviewHistoryHide : COPY.portal.reviewHistoryShow(entries.length)}
      </Button>
      {open ? (
        <ol className="space-y-2.5">
          {entries.map((entry) => (
            <RequestEntry key={entry.id} entry={entry} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

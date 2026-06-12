/**
 * Client-facing note thread. Renders client_facing notes as a list of cards
 * with author role label, body text, and timestamp. Empty state shown when
 * no notes exist yet.
 */
import { useQuery } from "@tanstack/react-query";
import { m } from "framer-motion";
import { clientCampaignNotesQueryOptions } from "@/lib/portal-api.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { senderLabel } from "@/lib/sender-label.ts";
import { fadeUp, staggerParent } from "@/lib/motion.ts";
import type { CaseNote } from "@mizan/shared";
import { Skeleton } from "@/components/ui/skeleton.tsx";

function NoteCard({ note }: { readonly note: CaseNote }): React.JSX.Element {
  const authorLabel = senderLabel(note.authorRole, {
    client: COPY.portal.noteFromYou,
    admin: COPY.portal.noteFromAdmin,
    reviewer: COPY.portal.noteFromReviewer,
  });
  const isClient = note.authorRole === "client";
  return (
    <m.div
      variants={fadeUp}
      className="rounded-xl border border-border/60 bg-card p-4 shadow-elev-1 space-y-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            isClient
              ? "text-xs font-semibold text-foreground"
              : "text-xs font-medium text-muted-foreground"
          }
        >
          {authorLabel}
        </span>
        <span className="font-numeric text-xs text-muted-foreground tabular">
          {new Date(note.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="text-sm leading-relaxed">{note.body}</p>
    </m.div>
  );
}

interface NoteThreadProps {
  readonly campaignId: string;
}

export function NoteThread({ campaignId }: NoteThreadProps): React.JSX.Element {
  const { data, isPending } = useQuery(clientCampaignNotesQueryOptions(campaignId));

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const notes = data?.notes ?? [];

  if (notes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/40 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        {COPY.portal.detailNotesEmpty}
      </p>
    );
  }

  return (
    <m.div variants={staggerParent} initial="hidden" animate="show" className="space-y-3">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </m.div>
  );
}

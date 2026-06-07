/**
 * Reviewer-side Messages tab. Two chat threads side by side (responsive: they
 * stack on narrow screens) — the client-facing thread and the internal
 * reviewer/admin thread. Each is a fixed-height, scrollable {@link MessageThread}
 * with its own composer; the viewer's own messages align right. Both threads
 * stay mounted so neither needs a tab switch.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CaseNote } from "@mizan/shared";
import {
  caseNotesQueryOptions,
  postClientMessage,
  postInternalNote,
} from "@/lib/case-notes-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { MessageThread } from "@/components/case/message-thread.tsx";

interface ReviewerNotesPanelProps {
  readonly caseId: string;
}

/** Posts a note via `post`, invalidating the case notes query on success. */
function useNoteMutation(caseId: string, post: (caseId: string, body: string) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => post(caseId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.notes(caseId) });
    },
    onError: (error: Error) => toast.error(error.message || COPY.reviewerNotes.composeError),
  });
}

function NotesLayout({
  caseId,
  notes,
}: {
  readonly caseId: string;
  readonly notes: readonly CaseNote[];
}): React.JSX.Element {
  const clientMutation = useNoteMutation(caseId, postClientMessage);
  const internalMutation = useNoteMutation(caseId, postInternalNote);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <MessageThread
        title={COPY.reviewerNotes.clientThreadTab}
        notes={notes.filter((n) => n.visibility === "client_facing")}
        placeholder={COPY.reviewerNotes.messagePlaceholder}
        pending={clientMutation.isPending}
        onCompose={(body) => clientMutation.mutateAsync(body)}
      />
      <MessageThread
        title={COPY.reviewerNotes.internalTab}
        notes={notes.filter((n) => n.visibility === "internal")}
        placeholder={COPY.reviewerNotes.internalPlaceholder}
        pending={internalMutation.isPending}
        onCompose={(body) => internalMutation.mutateAsync(body)}
      />
    </div>
  );
}

export function ReviewerNotesPanel({ caseId }: ReviewerNotesPanelProps): React.JSX.Element {
  const { data, isPending, error } = useQuery(caseNotesQueryOptions(caseId));

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[26rem] w-full rounded-xl" />
        <Skeleton className="h-[26rem] w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{COPY.reviewerNotes.panelTitle}</AlertTitle>
        <AlertDescription>{COPY.reviewerNotes.loadError}</AlertDescription>
      </Alert>
    );
  }

  return <NotesLayout caseId={caseId} notes={data?.notes ?? []} />;
}

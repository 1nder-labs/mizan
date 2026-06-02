/**
 * Reviewer-side case notes panel. Renders two sections as Cards:
 *   - Client thread: notes with visibility === "client_facing"
 *   - Internal notes: notes with visibility === "internal"
 *
 * Each section has its own `NoteComposer` form (RHF + zodResolver) that
 * posts to the appropriate endpoint and invalidates the notes query on
 * success. `useMutation` centralises error state; sonner toast on error.
 *
 * Two-Cards layout (not Tabs) keeps both sections in the DOM simultaneously
 * so both note classes are testable without tab-switching.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { NoteCreateSchema, type CaseNote, type NoteCreate } from "@mizan/shared";
import {
  caseNotesQueryOptions,
  postClientMessage,
  postInternalNote,
} from "@/lib/case-notes-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Button } from "@/components/ui/button.tsx";

interface NoteCardProps {
  readonly note: CaseNote;
}

function NoteCard({ note }: NoteCardProps): React.JSX.Element {
  const authorLabel =
    note.authorRole === "client" ? COPY.reviewerNotes.fromClient : COPY.reviewerNotes.fromReviewer;
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{authorLabel}</span>
        <span className="text-xs text-muted-foreground tabular">
          {new Date(note.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="text-sm leading-relaxed">{note.body}</p>
    </div>
  );
}

interface NoteComposerProps {
  readonly onSubmit: (body: string) => Promise<void>;
  readonly label: string;
  readonly placeholder: string;
  readonly pending: boolean;
}

function NoteBodyField({
  form,
  placeholder,
}: {
  readonly form: UseFormReturn<NoteCreate>;
  readonly placeholder: string;
}): React.JSX.Element {
  return (
    <FormField
      control={form.control}
      name="body"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <Textarea placeholder={placeholder} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function NoteComposer({
  onSubmit,
  label,
  placeholder,
  pending,
}: NoteComposerProps): React.JSX.Element {
  const form = useForm<NoteCreate>({
    resolver: zodResolver(NoteCreateSchema),
    defaultValues: { body: "" },
    mode: "onSubmit",
  });

  async function handleSubmit(values: NoteCreate): Promise<void> {
    await onSubmit(values.body);
    form.reset();
  }

  return (
    <Form {...form}>
      <form className="space-y-2" onSubmit={form.handleSubmit(handleSubmit)} noValidate>
        <NoteBodyField form={form} placeholder={placeholder} />
        <Button type="submit" size="sm" disabled={pending}>
          {label}
        </Button>
      </form>
    </Form>
  );
}

interface NotesSectionProps {
  readonly title: string;
  readonly notes: readonly CaseNote[];
  readonly composerLabel: string;
  readonly composerPlaceholder: string;
  readonly onCompose: (body: string) => Promise<void>;
  readonly pending: boolean;
}

function NotesSection({
  title,
  notes,
  composerLabel,
  composerPlaceholder,
  onCompose,
  pending,
}: NotesSectionProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.reviewerNotes.notesEmpty}</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
      <NoteComposer
        onSubmit={onCompose}
        label={composerLabel}
        placeholder={composerPlaceholder}
        pending={pending}
      />
    </div>
  );
}

interface ReviewerNotesPanelProps {
  readonly caseId: string;
}

interface NotesLayoutProps {
  readonly caseId: string;
  readonly notes: readonly CaseNote[];
}

function NotesLayout({ caseId, notes }: NotesLayoutProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const messageMutation = useMutation({
    mutationFn: (body: string) => postClientMessage(caseId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.notes(caseId) });
    },
    onError: () => toast.error(COPY.reviewerNotes.composeError),
  });
  const internalMutation = useMutation({
    mutationFn: (body: string) => postInternalNote(caseId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.notes(caseId) });
    },
    onError: () => toast.error(COPY.reviewerNotes.composeError),
  });
  const clientFacing = notes.filter((n) => n.visibility === "client_facing");
  const internal = notes.filter((n) => n.visibility === "internal");
  return (
    <div className="space-y-4">
      <NotesSection
        title={COPY.reviewerNotes.clientThreadTab}
        notes={clientFacing}
        composerLabel={COPY.reviewerNotes.sendMessage}
        composerPlaceholder={COPY.reviewerNotes.messagePlaceholder}
        onCompose={(body) => messageMutation.mutateAsync(body)}
        pending={messageMutation.isPending}
      />
      <NotesSection
        title={COPY.reviewerNotes.internalTab}
        notes={internal}
        composerLabel={COPY.reviewerNotes.addInternal}
        composerPlaceholder={COPY.reviewerNotes.internalPlaceholder}
        onCompose={(body) => internalMutation.mutateAsync(body)}
        pending={internalMutation.isPending}
      />
    </div>
  );
}

export function ReviewerNotesPanel({ caseId }: ReviewerNotesPanelProps): React.JSX.Element {
  const { data, isPending, error } = useQuery(caseNotesQueryOptions(caseId));

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
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

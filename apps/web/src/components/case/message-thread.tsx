/**
 * Chat-style message thread for the reviewer Messages tab. Renders one channel
 * (client-facing or internal) as a fixed-height, vertically scrollable window of
 * bubbles — the viewer's own messages align right, everyone else's left — with a
 * composer pinned to the bottom. Two of these sit side by side (responsive: they
 * stack on narrow screens).
 */
import { useEffect, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { m } from "framer-motion";
import { NoteCreateSchema, type CaseNote, type NoteCreate } from "@mizan/shared";
import { COPY } from "@/lib/copy-constants.ts";
import { fadeUp, staggerParent } from "@/lib/motion.ts";
import { cn } from "@/lib/utils.ts";
import { useViewerTopics } from "@/hooks/use-viewer-topics.ts";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Button } from "@/components/ui/button.tsx";

function MessageBubble({ note, mine }: { readonly note: CaseNote; readonly mine: boolean }) {
  const who =
    note.authorRole === "client" ? COPY.reviewerNotes.fromClient : COPY.reviewerNotes.fromReviewer;
  return (
    <m.div
      variants={fadeUp}
      className={cn("flex flex-col gap-0.5", mine ? "items-end" : "items-start")}
    >
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed",
          mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
        )}
      >
        {note.body}
      </div>
      <span className="px-1 text-[10px] text-muted-foreground tabular">
        <span>{mine ? COPY.reviewerNotes.fromYou : who}</span> ·{" "}
        {new Date(note.createdAt).toLocaleString()}
      </span>
    </m.div>
  );
}

function ThreadComposer({
  placeholder,
  pending,
  onCompose,
}: {
  readonly placeholder: string;
  readonly pending: boolean;
  readonly onCompose: (body: string) => Promise<void>;
}): React.JSX.Element {
  const form = useForm<NoteCreate>({
    resolver: zodResolver(NoteCreateSchema),
    defaultValues: { body: "" },
    mode: "onSubmit",
  });
  const submit = async (values: NoteCreate): Promise<void> => {
    await onCompose(values.body);
    form.reset();
  };
  return (
    <Form {...form}>
      <form className="flex items-end gap-2" onSubmit={form.handleSubmit(submit)} noValidate>
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Textarea
                  rows={1}
                  placeholder={placeholder}
                  className="min-h-9 resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {COPY.reviewerNotes.sendMessage}
        </Button>
      </form>
    </Form>
  );
}

interface MessageThreadProps {
  readonly title: string;
  readonly notes: readonly CaseNote[];
  readonly placeholder: string;
  readonly pending: boolean;
  readonly onCompose: (body: string) => Promise<void>;
}

export function MessageThread({
  title,
  notes,
  placeholder,
  pending,
  onCompose,
}: MessageThreadProps): React.JSX.Element {
  const { userId } = useViewerTopics();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [notes.length]);
  return (
    <div className="flex h-[26rem] min-h-0 flex-col rounded-lg border border-border/50 bg-card">
      <div className="shrink-0 border-b border-border/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{COPY.reviewerNotes.notesEmpty}</p>
        ) : (
          <m.div variants={staggerParent} initial="hidden" animate="show" className="space-y-3">
            {notes.map((note) => (
              <MessageBubble key={note.id} note={note} mine={note.authorUserId === userId} />
            ))}
          </m.div>
        )}
      </div>
      <div className="shrink-0 border-t border-border/40 p-3">
        <ThreadComposer placeholder={placeholder} pending={pending} onCompose={onCompose} />
      </div>
    </div>
  );
}

/**
 * Client-facing message composer. Lets a campaign creator reply to their
 * reviewer in the same thread the reviewer's messages appear in. Mirrors the
 * reviewer-side `NoteComposer` (RHF + zodResolver on `NoteCreateSchema`); the
 * author role + client_facing visibility are assigned server-side, so this only
 * carries the free text. Hidden by the caller once the case is decided.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { NoteCreateSchema, type NoteCreate } from "@mizan/shared";
import { postClientNote } from "@/lib/portal-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Button } from "@/components/ui/button.tsx";

interface NoteComposerProps {
  readonly campaignId: string;
}

export function ClientNoteComposer({ campaignId }: NoteComposerProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const form = useForm<NoteCreate>({
    resolver: zodResolver(NoteCreateSchema),
    defaultValues: { body: "" },
    mode: "onSubmit",
  });
  const mutation = useMutation({
    mutationFn: (body: string) => postClientNote(campaignId, body),
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: queryKeys.portal.notes(campaignId) });
    },
    onError: (error: Error) => toast.error(error.message || COPY.portal.noteComposeError),
  });

  return (
    <Form {...form}>
      <form
        className="space-y-3"
        onSubmit={form.handleSubmit((values) => mutation.mutateAsync(values.body))}
        noValidate
      >
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  className="rounded-xl border-border/60 bg-card shadow-elev-1 focus-visible:shadow-elev-2 transition-shadow"
                  placeholder={COPY.portal.noteComposePlaceholder}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {COPY.portal.noteComposeSend}
        </Button>
      </form>
    </Form>
  );
}

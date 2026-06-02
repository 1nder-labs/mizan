import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MailPlus } from "lucide-react";
import {
  CreateInvitationRequestSchema,
  type CreateInvitationRequest,
  type CreateInvitationResponse,
} from "@mizan/shared";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { useCreateInvitation } from "@/hooks/use-team.ts";
import { copyInviteUrlWithFallback } from "@/lib/copy-invite-url.ts";
import { ClipboardFallbackDialog } from "./clipboard-fallback-dialog.tsx";

function InvitationFields({
  form,
}: {
  readonly form: ReturnType<typeof useForm<CreateInvitationRequest>>;
}): React.JSX.Element {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          placeholder="reviewer@launchgood.com"
          {...form.register("email")}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-elev-1"
            {...form.register("role")}
          >
            <option value="reviewer">Reviewer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-ttl">Expires in (hours)</Label>
          <Input
            id="invite-ttl"
            type="number"
            min={1}
            max={168}
            {...form.register("ttlHours", { valueAsNumber: true })}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Runs the create-invitation flow with copy-to-clipboard fallback. Surfaces a
 * toast (rather than an unhandled rejection that leaves the dialog stuck) when
 * the mutation rejects.
 */
async function runInviteSubmit(args: {
  readonly create: (values: CreateInvitationRequest) => Promise<CreateInvitationResponse>;
  readonly values: CreateInvitationRequest;
  readonly setFallbackUrl: (url: string | null) => void;
  readonly onCreated: (url: string) => void;
  readonly onDone: () => void;
}): Promise<void> {
  try {
    const result = await args.create(args.values);
    await copyInviteUrlWithFallback(result.inviteUrl, args.setFallbackUrl);
    args.onCreated(result.inviteUrl);
    args.onDone();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Invitation failed");
  }
}

function InvitationForm({
  form,
  pending,
  onSubmit,
}: {
  readonly form: ReturnType<typeof useForm<CreateInvitationRequest>>;
  readonly pending: boolean;
  readonly onSubmit: (values: CreateInvitationRequest) => Promise<void>;
}): React.JSX.Element {
  return (
    <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
      <InvitationFields form={form} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Generating…" : "Create invite link"}
      </Button>
    </form>
  );
}

function useInviteDialog(onCreated: (url: string) => void) {
  const [open, setOpen] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const mutation = useCreateInvitation();
  const form = useForm<CreateInvitationRequest>({
    resolver: zodResolver(CreateInvitationRequestSchema),
    defaultValues: { email: "", role: "reviewer", ttlHours: 72 },
  });
  const submitInvite = (values: CreateInvitationRequest): Promise<void> =>
    runInviteSubmit({
      create: mutation.mutateAsync,
      values,
      setFallbackUrl,
      onCreated,
      onDone: () => {
        setOpen(false);
        form.reset();
      },
    });
  return {
    open,
    setOpen,
    fallbackUrl,
    setFallbackUrl,
    form,
    submitInvite,
    pending: mutation.isPending,
  };
}

export function InvitationDialog({
  onCreated,
}: {
  readonly onCreated: (url: string) => void;
}): React.JSX.Element {
  const { open, setOpen, fallbackUrl, setFallbackUrl, form, submitInvite, pending } =
    useInviteDialog(onCreated);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <MailPlus className="mr-2 size-3.5" />
          Invite reviewer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            Generates a one-time invitation URL. Copy and send manually.
          </DialogDescription>
        </DialogHeader>
        <InvitationForm form={form} pending={pending} onSubmit={submitInvite} />
      </DialogContent>
      {fallbackUrl ? (
        <ClipboardFallbackDialog
          url={fallbackUrl}
          open={Boolean(fallbackUrl)}
          onOpenChange={(next) => {
            if (!next) setFallbackUrl(null);
          }}
        />
      ) : null}
    </Dialog>
  );
}

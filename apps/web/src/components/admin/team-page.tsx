/**
 * Admin → Team page. Lists members + outstanding invitations and
 * surfaces an "Invite reviewer" modal that generates a shareable URL
 * (no email — admin copies + sends manually).
 */
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, MailPlus } from "lucide-react";
import { toast } from "sonner";
import {
  CreateInvitationRequestSchema,
  type CreateInvitationRequest,
  type TeamMember,
} from "@mizan/shared";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
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
import { useCreateInvitation, useTeamInvitations, useTeamMembers } from "@/hooks/use-team.ts";
import { formatMediumDateTime } from "@/lib/format.ts";

function MemberRow({ member }: { readonly member: TeamMember }): React.JSX.Element {
  return (
    <tr className="border-b border-border/40 last:border-b-0">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-foreground">{member.name}</p>
        <p className="text-xs text-muted-foreground">{member.email}</p>
      </td>
      <td className="px-4 py-3">
        <span className="rounded-full border border-border/60 bg-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]">
          {member.role}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular">
        {formatMediumDateTime(member.createdAt)}
      </td>
    </tr>
  );
}

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

function InvitationDialog({
  onCreated,
}: {
  readonly onCreated: (url: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const mutation = useCreateInvitation();
  const form = useForm<CreateInvitationRequest>({
    resolver: zodResolver(CreateInvitationRequestSchema),
    defaultValues: { email: "", role: "reviewer", ttlHours: 72 },
  });
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
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit(async (values) => {
            const result = await mutation.mutateAsync(values);
            await navigator.clipboard.writeText(result.inviteUrl);
            toast.success("Invite link copied to clipboard");
            onCreated(result.inviteUrl);
            setOpen(false);
            form.reset();
          })}
        >
          <InvitationFields form={form} />
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Generating…" : "Create invite link"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function copyInviteUrl(url: string): Promise<void> {
  await navigator.clipboard.writeText(url);
  toast.success("Invite link copied");
}

function InvitationRow({
  inv,
}: {
  readonly inv: {
    id: string;
    token: string;
    email: string;
    role: string;
    expiresAt: number;
    acceptedAt: number | null;
  };
}): React.JSX.Element {
  const url = `${window.location.origin}/invite/${inv.token}`;
  const accepted = inv.acceptedAt !== null;
  return (
    <tr className="border-b border-border/40 last:border-b-0">
      <td className="px-4 py-3 text-sm">{inv.email}</td>
      <td className="px-4 py-3 text-sm capitalize">{inv.role}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground tabular">
        {accepted ? "Accepted" : formatMediumDateTime(inv.expiresAt)}
      </td>
      <td className="px-4 py-3 text-right">
        {accepted ? (
          <span className="text-[10px] uppercase tracking-[0.22em] text-emerald-600">Accepted</span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => void copyInviteUrl(url)}>
            <Copy className="mr-1.5 size-3.5" />
            Copy
          </Button>
        )}
      </td>
    </tr>
  );
}

function InvitationsTable(): React.JSX.Element {
  const { data } = useTeamInvitations();
  const items = useMemo(() => data?.invitations ?? [], [data]);
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border/40 bg-card/60 p-6 text-center text-sm text-muted-foreground">
        No outstanding invitations.
      </p>
    );
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border/40 bg-muted/30 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <th className="px-4 py-2 text-left">Email</th>
          <th className="px-4 py-2 text-left">Role</th>
          <th className="px-4 py-2 text-left">Expires</th>
          <th className="px-4 py-2 text-right">Link</th>
        </tr>
      </thead>
      <tbody>
        {items.map((inv) => (
          <InvitationRow key={inv.id} inv={inv} />
        ))}
      </tbody>
    </table>
  );
}

function MembersCard({ members }: { readonly members: readonly TeamMember[] }): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Members</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              <th className="px-4 py-2 text-left">Member</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-right">Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function LastInviteBanner({ url }: { readonly url: string }): React.JSX.Element {
  return (
    <Card className="border-foreground/20 bg-foreground/[0.04]">
      <CardContent className="flex items-center justify-between gap-4 py-3">
        <code className="truncate text-xs">{url}</code>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast.success("Copied again");
          }}
        >
          <Copy className="mr-1.5 size-3.5" />
          Copy
        </Button>
      </CardContent>
    </Card>
  );
}

export function AdminTeamPage(): React.JSX.Element {
  const members = useTeamMembers();
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  return (
    <AuthenticatedShell context="Team management">
      <section className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
            <p className="text-sm text-muted-foreground">
              Members + outstanding invitations. Invite by generating a shareable link.
            </p>
          </div>
          <InvitationDialog onCreated={setLastInviteUrl} />
        </header>
        {lastInviteUrl ? <LastInviteBanner url={lastInviteUrl} /> : null}
        <MembersCard members={members.data?.members ?? []} />
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Invitations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <InvitationsTable />
          </CardContent>
        </Card>
      </section>
    </AuthenticatedShell>
  );
}

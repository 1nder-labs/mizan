/**
 * Admin → Team page. Lists members + outstanding invitations and
 * surfaces an "Invite reviewer" modal that generates a shareable URL
 * (no email — admin copies + sends manually).
 */
import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { type TeamInvitation, type TeamMember } from "@mizan/shared";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useTeamInvitations, useTeamMembers } from "@/hooks/use-team.ts";
import { copyInviteUrlWithFallback } from "@/lib/copy-invite-url.ts";
import { formatMediumDateTime } from "@/lib/format.ts";
import { ClipboardFallbackDialog } from "./clipboard-fallback-dialog.tsx";
import { InvitationDialog } from "./team-invite-dialog.tsx";

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

function InvitationRow({
  inv,
  onReveal,
}: {
  readonly inv: TeamInvitation;
  readonly onReveal: (url: string) => void;
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void copyInviteUrlWithFallback(url, onReveal)}
          >
            <Copy className="mr-1.5 size-3.5" />
            Copy
          </Button>
        )}
      </td>
    </tr>
  );
}

function InvitationsTable({
  onReveal,
}: {
  readonly onReveal: (url: string) => void;
}): React.JSX.Element {
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
          <InvitationRow key={inv.id} inv={inv} onReveal={onReveal} />
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

function LastInviteBanner({
  url,
  onReveal,
}: {
  readonly url: string;
  readonly onReveal: (url: string) => void;
}): React.JSX.Element {
  return (
    <Card className="border-foreground/20 bg-foreground/[0.04]">
      <CardContent className="flex items-center justify-between gap-4 py-3">
        <code className="truncate text-xs">{url}</code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copyInviteUrlWithFallback(url, onReveal)}
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
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
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
        {lastInviteUrl ? <LastInviteBanner url={lastInviteUrl} onReveal={setFallbackUrl} /> : null}
        <MembersCard members={members.data?.members ?? []} />
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Invitations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <InvitationsTable onReveal={setFallbackUrl} />
          </CardContent>
        </Card>
        {fallbackUrl ? (
          <ClipboardFallbackDialog
            url={fallbackUrl}
            open={Boolean(fallbackUrl)}
            onOpenChange={(next) => {
              if (!next) setFallbackUrl(null);
            }}
          />
        ) : null}
      </section>
    </AuthenticatedShell>
  );
}

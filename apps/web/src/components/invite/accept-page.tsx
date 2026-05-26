/**
 * `/invite/$token` accept landing page — public surface.
 *
 * Three render branches:
 *   1. Token invalid / expired / already accepted → error card with
 *      home button.
 *   2. Token valid + viewer not signed in → call-to-action: "Sign in
 *      as <email>". After login, the accept button auto-fires (effect
 *      detects fresh session).
 *   3. Token valid + viewer signed in with matching email → "Accept
 *      and join" button calls accept API, then navigates to /queue.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useAcceptInvitation, useInvitationLookup } from "@/hooks/use-team.ts";
import { sessionQueryOptions } from "@/lib/auth-client.ts";

const inviteApi = getRouteApi("/invite/$token");

function InviteShell({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          <span className="text-sm font-semibold tracking-tight">Mizan</span>
        </div>
        {children}
      </div>
    </main>
  );
}

function InviteError({ message }: { readonly message: string }): React.JSX.Element {
  return (
    <InviteShell>
      <Card>
        <CardHeader>
          <CardTitle>Invitation issue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">{message}</p>
          <Button asChild variant="outline">
            <Link to="/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </InviteShell>
  );
}

function InviteSignInPrompt({
  inv,
}: {
  readonly inv: { inviterName: string; email: string; role: string };
}): React.JSX.Element {
  return (
    <InviteShell>
      <Card>
        <CardHeader>
          <CardTitle>You're invited to Mizan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {inv.inviterName} invited <strong>{inv.email}</strong> to join as <strong>{inv.role}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            Sign in with that email to finish joining the team.
          </p>
          <Button asChild className="w-full">
            <Link to="/login">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </InviteShell>
  );
}

function InviteJoining({ role }: { readonly role: string }): React.JSX.Element {
  return (
    <InviteShell>
      <Card>
        <CardHeader>
          <CardTitle>Joining the team…</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Setting your role to {role}.</p>
        </CardContent>
      </Card>
    </InviteShell>
  );
}

function useAutoAccept(args: {
  readonly token: string;
  readonly enabled: boolean;
  readonly accept: ReturnType<typeof useAcceptInvitation>;
  readonly navigate: ReturnType<typeof useNavigate>;
}): void {
  const { token, enabled, accept, navigate } = args;
  useEffect(() => {
    if (!enabled || accept.isPending || accept.isSuccess) return;
    accept.mutate(
      { token },
      {
        onSuccess: (data) => {
          toast.success("Welcome to the team");
          void navigate({ to: data.redirectTo });
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }, [token, enabled, accept, navigate]);
}

export function InviteAcceptPage(): React.JSX.Element {
  const { token } = inviteApi.useParams();
  const navigate = useNavigate();
  const lookup = useInvitationLookup(token);
  const session = useQuery(sessionQueryOptions());
  const accept = useAcceptInvitation();
  const inv = lookup.data;
  const viewerEmail = session.data?.user.email?.toLowerCase() ?? null;
  const emailMatches = inv && viewerEmail !== null && viewerEmail === inv.email;
  useAutoAccept({ token, enabled: Boolean(inv && emailMatches), accept, navigate });
  if (lookup.isPending) {
    return (
      <InviteShell>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading invitation…</CardContent>
        </Card>
      </InviteShell>
    );
  }
  if (lookup.isError || !inv) {
    return <InviteError message="This invitation is not valid. Ask your admin for a fresh link." />;
  }
  if (inv.accepted) return <InviteError message="This invitation has already been accepted." />;
  if (Date.now() > inv.expiresAt) return <InviteError message="This invitation has expired. Ask your admin for a fresh link." />;
  if (!session.data) return <InviteSignInPrompt inv={inv} />;
  if (!emailMatches) {
    return (
      <InviteError
        message={`This invitation is for ${inv.email}. You're signed in as ${viewerEmail ?? "another account"}.`}
      />
    );
  }
  return <InviteJoining role={inv.role} />;
}

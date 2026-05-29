/**
 * `/invite/$token` accept landing page — public surface.
 *
 * Invite acceptance happens server-side during signup (org database hook).
 * This page validates the token, then either prompts sign-in or redirects
 * an already-authenticated matching user to the queue.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useInvitationLookup } from "@/hooks/use-team.ts";
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
            {inv.inviterName} invited <strong>{inv.email}</strong> to join as{" "}
            <strong>{inv.role}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            Create an account with that email - you'll join the team automatically after signup.
          </p>
          <Button asChild className="w-full">
            <Link to="/signup" search={{ email: inv.email }}>
              Create account
            </Link>
          </Button>
        </CardContent>
      </Card>
    </InviteShell>
  );
}

/** Renders the pre-redirect gate, or null once the viewer may proceed. */
function renderInviteGate(
  lookup: ReturnType<typeof useInvitationLookup>,
  hasSession: boolean,
  emailMatches: boolean,
  viewerEmail: string | null,
): React.JSX.Element | null {
  if (lookup.isPending) {
    return (
      <InviteShell>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Loading invitation…
          </CardContent>
        </Card>
      </InviteShell>
    );
  }
  const inv = lookup.data;
  if (lookup.isError || !inv) {
    return <InviteError message="This invitation is not valid. Ask your admin for a fresh link." />;
  }
  if (inv.accepted) return <InviteError message="This invitation has already been accepted." />;
  if (Date.now() > inv.expiresAt) {
    return <InviteError message="This invitation has expired. Ask your admin for a fresh link." />;
  }
  if (!hasSession) return <InviteSignInPrompt inv={inv} />;
  if (!emailMatches) {
    return (
      <InviteError
        message={`This invitation is for ${inv.email}. You're signed in as ${viewerEmail ?? "another account"}.`}
      />
    );
  }
  return null;
}

export function InviteAcceptPage(): React.JSX.Element {
  const { token } = inviteApi.useParams();
  const navigate = useNavigate();
  const lookup = useInvitationLookup(token);
  const session = useQuery(sessionQueryOptions());
  const inv = lookup.data;
  const viewerEmail = session.data?.user.email?.toLowerCase() ?? null;
  const emailMatches = Boolean(
    inv && viewerEmail !== null && viewerEmail === inv.email.toLowerCase(),
  );

  useEffect(() => {
    if (!inv || !session.data || !emailMatches) return;
    toast.success(`Welcome — you're now a ${inv.role} in ${inv.inviterName}'s workspace`);
    void navigate({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
  }, [inv, session.data, emailMatches, navigate]);

  const gate = renderInviteGate(lookup, Boolean(session.data), emailMatches, viewerEmail);
  if (gate) return gate;
  return (
    <InviteShell>
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Redirecting to your queue…
        </CardContent>
      </Card>
    </InviteShell>
  );
}

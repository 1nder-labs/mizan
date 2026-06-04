/**
 * Login page component. Renders the reviewer sign-in form with visual
 * chrome. On successful authentication, invalidates the session query
 * with `refetchType: 'all'` (TanStack Query canonical for inactive
 * caches per https://tanstack.com/query/v5/docs/reference/QueryClient
 * #queryclientinvalidatequeries) so the awaited fetch completes
 * regardless of observer presence. Then invalidates `me` and reads
 * the role to determine the post-login destination:
 *   - client role → `/portal/campaigns`
 *   - reviewer/admin → `/queue`
 *
 * Session + me must both be invalidated before the role branch: a stale
 * me entry from a prior session would misroute. `refetchType: 'all'` on
 * session ensures the re-fetch completes even when no observer exists.
 */
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { SESSION_QUERY_KEY } from "@/lib/auth-client.ts";
import { meQueryOptions } from "@/lib/me-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { LoginForm } from "@/components/login/form.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

/**
 * Resolves the post-login destination by role. Removes (not just invalidates)
 * the cached `me` first: after signing in as a different role, `ensureQueryData`
 * would otherwise resolve with the stale prior `me` (invalidation alone doesn't
 * refetch an observer-less query), routing e.g. an admin to the client portal.
 * Removing forces a fresh fetch under the new session cookie.
 */
async function navigateByRole(
  queryClient: QueryClient,
  navigate: ReturnType<typeof useNavigate>,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: [...SESSION_QUERY_KEY], refetchType: "all" });
  queryClient.removeQueries({ queryKey: queryKeys.me() });
  const me = await queryClient.ensureQueryData(meQueryOptions());
  if (me.user.role === "client") {
    await navigate({ to: "/portal/campaigns" });
    return;
  }
  await navigate({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
}

export function LoginPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ShieldCheck className="size-4" />
          <span>Mizan reviewer console</span>
        </div>
        <Card className="border-border/80 shadow-elev-1">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl tracking-tight">Sign in</CardTitle>
            <CardDescription>Trust &amp; Safety / Zakat review surface.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm onAuthenticated={() => navigateByRole(queryClient, navigate)} />
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {COPY.portal.loginClientPrompt}{" "}
          <Link
            to="/portal-signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {COPY.portal.loginClientLink}
          </Link>
        </p>
      </div>
    </main>
  );
}

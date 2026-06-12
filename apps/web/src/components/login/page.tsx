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
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { SESSION_QUERY_KEY } from "@/lib/auth-client.ts";
import { meQueryOptions } from "@/lib/me-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { BrandMark } from "@/components/brand-mark.tsx";
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
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <BrandMark className="size-16" />
          <div className="flex flex-col gap-1">
            <h1 className="text-display text-2xl font-semibold tracking-tight">Mizan</h1>
            <p className="text-sm text-muted-foreground">Trust &amp; Safety review console</p>
          </div>
        </div>
        <Card className="border-border shadow-elev-2">
          <CardHeader className="space-y-1 pb-5 pt-6">
            <CardTitle className="text-2xl font-semibold text-display">Sign in</CardTitle>
            <CardDescription>Trust &amp; Safety / Zakat review surface.</CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
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

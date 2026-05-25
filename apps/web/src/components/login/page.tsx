/**
 * Login page component. Renders the reviewer sign-in form with visual
 * chrome. On successful authentication, invalidates the session query
 * with `refetchType: 'all'` (TanStack Query canonical for inactive
 * caches per https://tanstack.com/query/v5/docs/reference/QueryClient
 * #queryclientinvalidatequeries) so the awaited fetch completes
 * regardless of observer presence, then navigates to `/queue`.
 *
 * Default `refetchType: 'active'` marks the cache stale but does NOT
 * refetch when no component has subscribed. `requireSession` would
 * then see the still-cached `null` and throw a redirect back to
 * `/login` — exactly the bug this protects against.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { SESSION_QUERY_KEY } from "@/lib/auth-client.ts";
import { LoginForm } from "@/components/login/form.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

export function LoginPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function handleAuthenticated(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: [...SESSION_QUERY_KEY],
      refetchType: "all",
    });
    await navigate({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
  }

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
            <LoginForm onAuthenticated={handleAuthenticated} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

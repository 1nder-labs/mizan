/**
 * `/portal-signup` route — campaign-creator account creation.
 * Card-wrapped, no auth guard (anonymous visitors can reach it).
 * On authenticated, invalidates session + me then navigates to
 * the client campaigns list.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SESSION_QUERY_KEY } from "@/lib/auth-client.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { PortalSignupForm } from "@/components/portal/signup-form.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

export const Route = createFileRoute("/portal-signup")({
  component: PortalSignupRoutePage,
});

export function PortalSignupRoutePage(): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleAuthenticated(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: [...SESSION_QUERY_KEY], refetchType: "all" });
    await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    await navigate({ to: "/portal/campaigns" });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span>{COPY.portal.brand}</span>
        </div>
        <Card className="border-border/80 shadow-elev-1">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl tracking-tight">{COPY.portal.signupTitle}</CardTitle>
            <CardDescription>{COPY.portal.signupSubtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            <PortalSignupForm onAuthenticated={handleAuthenticated} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

/**
 * `/portal-signup` route — campaign-creator account creation.
 * Card-wrapped, no auth guard (anonymous visitors can reach it).
 * On authenticated, invalidates session + me then navigates to
 * the client campaigns list.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
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

const SIGNUP_STEPS = [
  COPY.portal.listEmptyStep1,
  COPY.portal.listEmptyStep2,
  COPY.portal.listEmptyStep3,
] as const;

/** Ordered list of onboarding steps shown below the signup card. */
function SignupSteps(): React.JSX.Element {
  return (
    <div className="mt-8">
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {COPY.portal.signupStepsTitle}
      </p>
      <ol className="mt-4 space-y-3">
        {SIGNUP_STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-3 text-sm text-muted-foreground">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted font-numeric text-[11px] font-semibold">
              {i + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

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
        <div className="mb-8 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="size-4" />
          <span>{COPY.portal.brand}</span>
        </div>
        <Card className="rounded-xl border-border shadow-elev-1">
          <CardHeader className="space-y-1.5 pb-5">
            <CardTitle className="text-2xl font-semibold text-display">
              {COPY.portal.signupTitle}
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {COPY.portal.signupSubtitle}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PortalSignupForm onAuthenticated={handleAuthenticated} />
          </CardContent>
        </Card>
        <SignupSteps />
      </div>
    </main>
  );
}

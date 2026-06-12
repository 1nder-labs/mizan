/**
 * `/signup` route — account creation for fresh users and invited reviewers.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { SESSION_QUERY_KEY } from "@/lib/auth-client.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { BrandMark } from "@/components/brand-mark.tsx";
import { SignupForm } from "@/components/signup/form.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

const SignupSearchSchema = z.object({
  email: z.email().optional(),
});

export const Route = createFileRoute("/signup")({
  validateSearch: SignupSearchSchema,
  component: SignupRoutePage,
});

export function SignupRoutePage(): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const inviteEmail = search.email ?? "";

  async function handleAuthenticated(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: [...SESSION_QUERY_KEY], refetchType: "all" });
    await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    await navigate({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark className="size-9" />
          <div className="flex flex-col gap-0">
            <span className="text-sm font-semibold leading-tight tracking-tight">Mizan</span>
            <span className="text-xs text-muted-foreground">Reviewer console</span>
          </div>
        </div>
        <Card className="border-border shadow-elev-2">
          <CardHeader className="space-y-1 pb-5 pt-6">
            <CardTitle className="text-2xl font-semibold text-display">Create account</CardTitle>
            <CardDescription>Join your workspace or start a new one.</CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <SignupForm
              defaultEmail={inviteEmail}
              emailReadonly={inviteEmail.length > 0}
              onAuthenticated={handleAuthenticated}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

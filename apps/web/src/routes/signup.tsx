/**
 * `/signup` route — account creation for fresh users and invited reviewers.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { z } from "zod";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { SESSION_QUERY_KEY } from "@/lib/auth-client.ts";
import { queryKeys } from "@/lib/query-keys.ts";
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
    <main className="grid min-h-screen place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ShieldCheck className="size-4" />
          <span>Mizan reviewer console</span>
        </div>
        <Card className="border-border/80 shadow-elev-1">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl tracking-tight">Create account</CardTitle>
            <CardDescription>Join your workspace or start a new one.</CardDescription>
          </CardHeader>
          <CardContent>
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

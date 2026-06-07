/**
 * Root `/` route — redirects based on session + role:
 *   - no session → `/login`
 *   - client role → `/portal/campaigns`
 *   - reviewer/admin → `/queue`
 *
 * Reads session then me so the role check uses a fresh cache entry.
 * Both queries share entries with child routes (staleTime: 60s).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { sessionQueryOptions } from "@/lib/auth-client.ts";
import { meQueryOptions } from "@/lib/me-api.ts";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (!session) {
      throw redirect({ to: "/login" });
    }
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (me.user.role === "client") {
      throw redirect({ to: "/portal/campaigns" });
    }
    throw redirect({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
  },
});

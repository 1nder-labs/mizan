/**
 * Root `/` route — redirects to `/queue` (signed in) or `/login` (not).
 * Reads the session via `ensureQueryData` so the cache hydrates once
 * and child routes share the same entry.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { sessionQueryOptions } from "@/lib/auth-client.ts";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session) {
      throw redirect({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
    }
    throw redirect({ to: "/login" });
  },
});

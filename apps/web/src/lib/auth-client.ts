/**
 * Better-auth React client + session-state plumbing.
 *
 * `authClient` is created once at module load; better-auth's React
 * client handles cookie state and SSE-ish session refresh internally.
 *
 * `sessionQueryOptions` wraps the session lookup in a React Query
 * entry so route loaders can `ensureQueryData` it once per app mount
 * (per PRD §7.7.5: session state belongs to the auth client + React
 * Query layer). `getSession` returns `{ data, error }`; we surface the
 * data and let `null` represent the logged-out state — never throw,
 * so the query cache always has a defined value.
 *
 * `requireSession` / `requireAdmin` are loader gates. They throw
 * TanStack Router's `redirect(...)` (recognised by the router as a
 * navigation signal, not a real exception) when the session is missing
 * or lacks admin role.
 */
import { createAuthClient } from "better-auth/react";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";

export const authClient = createAuthClient();

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

async function fetchSession(): Promise<SessionData> {
  const { data } = await authClient.getSession();
  return data ?? null;
}

export const SESSION_QUERY_KEY = ["session"] as const;

export function sessionQueryOptions(): ReturnType<typeof queryOptions<SessionData>> {
  return queryOptions<SessionData>({
    queryKey: [...SESSION_QUERY_KEY],
    queryFn: fetchSession,
    staleTime: 60_000,
  });
}

export async function requireSession(qc: QueryClient): Promise<NonNullable<SessionData>> {
  const session = await qc.ensureQueryData(sessionQueryOptions());
  if (!session) throw redirect({ to: "/login" });
  return session;
}

export async function requireAdmin(qc: QueryClient): Promise<NonNullable<SessionData>> {
  const session = await requireSession(qc);
  if (session.user.role !== "admin") throw redirect({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
  return session;
}

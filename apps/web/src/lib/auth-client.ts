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
import { inferAdditionalFields, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { DEFAULT_QUEUE_SEARCH, type MeResponse } from "@mizan/shared";
import { meQueryOptions } from "./me-api.ts";

/**
 * `inferAdditionalFields` teaches the client that `signUp.email` accepts the
 * server-declared `signupKind` user field (optional, defaults to `internal`),
 * so the client-signup form can pass `signupKind: "client"` type-safely while
 * the existing reviewer/admin signup keeps omitting it.
 */
export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    inferAdditionalFields({ user: { signupKind: { type: "string", required: false } } }),
  ],
});

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

export async function requireAdmin(qc: QueryClient): Promise<MeResponse> {
  await requireSession(qc);
  const me = await qc.ensureQueryData(meQueryOptions());
  if (me.user.role !== "admin") {
    throw redirect({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
  }
  return me;
}

/**
 * Guards reviewer-only surfaces (queue, case detail). A `client` session is
 * bounced to its own portal — the reviewer API already 403s a client, so this
 * just keeps a stray client off a reviewer route (e.g. a bookmarked /queue or a
 * lingering session after a persona switch) instead of stranding them on a
 * broken, data-less page.
 */
export async function requireReviewer(qc: QueryClient): Promise<MeResponse> {
  await requireSession(qc);
  const me = await qc.ensureQueryData(meQueryOptions());
  if (me.user.role === "client") {
    throw redirect({ to: "/portal/campaigns" });
  }
  return me;
}

/**
 * Loader gate for the client portal: a logged-in non-client (reviewer/admin)
 * is bounced to the reviewer queue, mirroring how `requireAdmin` bounces
 * non-admins. Anonymous callers bounce to `/login` via `requireSession`.
 */
export async function requireClient(qc: QueryClient): Promise<MeResponse> {
  await requireSession(qc);
  const me = await qc.ensureQueryData(meQueryOptions());
  if (me.user.role !== "client") {
    throw redirect({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
  }
  return me;
}

---
module: apps/web
date: 2026-05-25
last_refreshed: 2026-05-25
problem_type: architecture_pattern
component: tooling
severity: high
related_components:
  - apps/web/src/lib/auth-client.ts
  - apps/web/src/lib/cases-api.ts
  - apps/web/src/lib/query-client.ts
  - apps/web/src/components/login/page.tsx
  - apps/web/src/hooks/use-sign-out.ts
  - apps/web/src/main.tsx
tags:
  - tanstack-query
  - tanstack-router
  - better-auth
  - session-cache
  - invalidatequeries
  - refetchtype
  - 401-redirect
applies_when:
  - "Wrapping a session / auth state in TanStack Query and using it from route loaders via ensureQueryData"
  - "Mutating server state (login, logout, role escalation) when no component is currently observing the affected query"
  - "Post-mutation navigation that depends on the next route's loader seeing fresh data"
---

# Post-mutation cache refresh: `refetchType: 'all'` for inactive observers, plus a 401 → /login pipeline

## Context

Phase 6's reviewer UI wraps `better-auth.getSession()` in a TanStack Query entry keyed `['session']` so route loaders can call `qc.ensureQueryData(sessionQueryOptions())` from `beforeLoad`. Login + logout both invalidate the same key and navigate. On paper the chain is:

1. POST `/api/auth/sign-in/email` → 200 + `Set-Cookie`
2. `await queryClient.invalidateQueries({ queryKey: ['session'] })`
3. `await navigate({ to: '/queue', search: DEFAULT_QUEUE_SEARCH })`
4. TanStack Router runs `/queue` `beforeLoad` → `requireSession(qc)` → `ensureQueryData(sessionQueryOptions())` → returns fresh session → no redirect → user lands on /queue.

In practice, the navigate landed back on `/login` even though the cookie was set and the server-side session was live. Same shape on sign-out: invalidate the cache, navigate to `/login`, but the next protected-route open occasionally still read the stale session.

There is also an orthogonal foot-gun once the session does land: any read endpoint can return 401 (cookie expired, server-side session revoked, role demoted). Without a global handler, the only feedback is a generic "Failed to load" notice on a guarded route — the reviewer has no way back to `/login` short of typing the URL.

## Guidance

For mutations that change cached server state when no component is actively subscribed to that cache entry, force a refetch with `refetchType: 'all'`. For 401/403 across all queries, wire a single `QueryCache.onError` that clears the session and bounces the user to `/login` via the router.

### Post-mutation refetch on an inactive cache entry

```ts
async function handleAuthenticated(): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: SESSION_QUERY_KEY,
    refetchType: "all",
  });
  await navigate({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
}
```

The `refetchType: 'all'` is the load-bearing change. Default `refetchType: 'active'` only refetches queries that have an observer (a mounted component subscribing via `useQuery`). The session entry has no observer at the moment login fires — no component is reading it on the login page — so the default invalidate marks it stale but never issues a new fetch. The next `ensureQueryData(sessionQueryOptions())` call from `/queue`'s `requireSession` then returns the cached `null` immediately (background-refetching in parallel), `requireSession` throws `redirect({ to: "/login" })`, and the navigation bounces back to login. `refetchType: 'all'` makes the awaited promise resolve only after the refetch lands, so the next `ensureQueryData` sees the live session.

The same correction applies to logout:

```ts
const mutation = useMutation({
  mutationFn: async () => {
    await authClient.signOut();
  },
  onSuccess: async () => {
    await queryClient.invalidateQueries({
      queryKey: SESSION_QUERY_KEY,
      refetchType: "all",
    });
    await navigate({ to: "/login" });
  },
});
```

### Global 401 → `/login` via `QueryCache.onError` (403 stays in place)

401 (session expired) and 403 (authenticated but lacks role) are different failure modes — collapsing them into one error class and one redirect rule yanks legitimate admins through `/login` when they hit a forbidden route. Split them at the boundary, redirect only on 401:

```ts
export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Session expired") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403 as const;
  constructor(message = "You don't have permission to view this resource") {
    super(message);
    this.name = "ForbiddenError";
  }
}

function assertAuthorized(status: number): void {
  if (status === 401) throw new UnauthorizedError();
  if (status === 403) throw new ForbiddenError();
}

async function fetchCases(search: QueueSearch): Promise<QueueResponse> {
  const res = await api.cases.$get({ query: toQuery(search) });
  assertAuthorized(res.status);
  if (!res.ok) throw new Error(`cases list failed: ${res.status}`);
  return QueueResponseSchema.parse(await res.json());
}
```

The QueryClient wires a single error handler that recovers only on 401. Both error classes turn retry off so React Query doesn't drown an already-decided auth state in retries:

```ts
export function makeQueryClient(hooks: { onAuthFailure?: () => void } = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof UnauthorizedError) hooks.onAuthFailure?.();
      },
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof UnauthorizedError) return false;
          if (error instanceof ForbiddenError) return false;
          return failureCount < 1;
        },
      },
    },
  });
}
```

`main.tsx` then bridges the auth-failure hook into the router without a circular import:

```ts
let navigateToLogin: () => void = () => {};

const queryClient = makeQueryClient({
  onAuthFailure: () => {
    queryClient.setQueryData(["session"], null);
    navigateToLogin();
  },
});

const router = createRouter({ routeTree, context: { queryClient } });

navigateToLogin = () => {
  void router.navigate({ to: "/login" });
};
```

## Why This Matters

`invalidateQueries` is the single most common post-mutation primitive in TanStack Query. Its default `refetchType: 'active'` is correct for the typical case (a component is showing the data; the user expects the screen to refresh). It is wrong for any flow where the post-mutation consumer is a route loader / `ensureQueryData` call rather than a mounted observer. Loaders read the cache directly and trust its freshness; they never trigger the background refetch that an active observer would.

The symptom of getting this wrong is a route guard that bounces the user back to where they came from after a successful mutation — login bounces to login, logout bounces to a stale protected page until the next navigation, role-elevation appears to take no effect. It looks like a routing bug or a cookie bug. It is neither. It is the default `refetchType` failing silently because nothing is observing the cache yet.

`refetchType: 'all'` is documented as "Refetch all matching queries" (TanStack Query v5 `invalidateQueries` reference). It includes inactive ones. The awaited promise resolves only after every matching refetch completes, which is exactly the contract loaders need.

The `QueryCache.onError` + `UnauthorizedError` pipeline solves a different but related problem: once the session does land correctly, what happens when it later expires mid-session? Without this hook, a 401 on `/queue` shows `"Failed to load cases"` on a guarded route. With it, the reviewer is bounced to `/login` automatically and the session cache is pre-cleared so the next attempt revalidates from the server.

## When to Apply

- A mutation invalidates a cache key that no currently-mounted component observes (login / logout / role-escalation / background-job results polled only by loaders).
- A post-mutation `await navigate(...)` lands on a route whose loader reads the same key through `ensureQueryData` / `Route.useLoaderData`.
- Any authenticated read can return 401/403 and you want a single redirect rule for 401s (session expired) without yanking 403s (lacks permission) through `/login`.
- You wrap a non-React-Query state primitive (better-auth `useSession`, a websocket connection, a global event bus) inside a Query entry to share cache + loader semantics.

## Examples

### Before — invalidate-only (stale session at the next route)

```ts
async function handleAuthenticated(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  await navigate({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
}
```

`/queue` beforeLoad → `requireSession(qc)` → `ensureQueryData` → cached `null` (stale, background-refetching) → throw `redirect({ to: "/login" })` → user bounces.

### After — refetch the inactive entry, then navigate

```ts
async function handleAuthenticated(): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: SESSION_QUERY_KEY,
    refetchType: "all",
  });
  await navigate({ to: "/queue", search: DEFAULT_QUEUE_SEARCH });
}
```

`await` resolves only after the refetch completes; `/queue`'s `ensureQueryData` reads the live session; `requireSession` returns the user object; navigation lands on `/queue`.

### Per-call 401 handling

```ts
async function fetchCase(id: string): Promise<CaseDetailResponse> {
  const res = await api.cases[":id"].$get({ param: { id } });
  assertAuthorized(res.status);             // throws UnauthorizedError on 401 or ForbiddenError on 403
  if (!res.ok) throw new Error(`case fetch failed: ${res.status}`);
  return CaseDetailResponseSchema.parse(await res.json());
}
```

The QueryCache.onError catches `UnauthorizedError`, clears the session cache, and the configured `onAuthFailure` navigates to `/login`. No per-component handler needed.

## Anti-pattern checklist

- ❌ Bare `await queryClient.invalidateQueries({ queryKey })` after a mutation whose downstream consumer is a route loader (the default `refetchType: 'active'` does not refetch inactive caches).
- ❌ `queryClient.refetchQueries(...)` as a workaround — works but masks the intent. `invalidateQueries({ refetchType: 'all' })` is the documented post-mutation form.
- ❌ `queryClient.setQueryData(SESSION_QUERY_KEY, fakeData)` to seed the cache from a mutation response. Works for the immediate navigate but skips schema validation and gets out of sync with the server's view (e.g., `emailVerified` updated by a side-channel).
- ❌ Per-component 401 catch handlers (`if (error.message.includes('401')) navigate('/login')`). Breaks the moment one consumer forgets it; not type-safe.
- ❌ Caching the QueryClient at module load AND constructing it with handlers that capture a not-yet-created router. Use the deferred-closure pattern in `main.tsx` instead.

## Related references

- `apps/web/src/lib/cases-api.ts` — `UnauthorizedError` + `assertAuthorized`
- `apps/web/src/lib/query-client.ts` — `QueryCache.onError` + retry-off for `UnauthorizedError`
- `apps/web/src/main.tsx` — deferred-closure wiring router → onAuthFailure
- `apps/web/src/components/login/page.tsx` — canonical post-login refetch
- `apps/web/src/hooks/use-sign-out.ts` — canonical post-logout refetch
- TanStack Query v5 `invalidateQueries` reference: https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientinvalidatequeries
- TanStack Router `beforeLoad` / `ensureQueryData` pattern with better-auth: https://www.better-auth.com/docs/integrations/tanstack

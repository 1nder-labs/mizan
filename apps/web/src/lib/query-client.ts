/**
 * Singleton QueryClient factory.
 *
 * Module-level cache survives React 19 strict-mode double-renders in
 * dev so route loaders and component subscribers share the exact same
 * client instance. Defaults pin server-state semantics PRD §7.7.5
 * names: 30s stale window, 5min GC, single retry. Mutations stay at
 * library default (no retry) — `apiMutate`'s `Idempotency-Key` makes
 * client-driven retry the caller's job.
 *
 * `onAuthFailure` (optional) wires the QueryCache global `onError` so
 * every query that throws `UnauthorizedError` triggers a single
 * redirect-to-login plus session-cache clear. Caller passes the
 * router redirect callable from `main.tsx` to avoid this module
 * importing the router.
 */
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { UnauthorizedError } from "./cases-api.ts";

let cached: QueryClient | undefined;

interface QueryClientHooks {
  readonly onAuthFailure?: () => void;
}

export function makeQueryClient(hooks: QueryClientHooks = {}): QueryClient {
  if (!cached) {
    cached = new QueryClient({
      queryCache: new QueryCache({
        onError: (error) => {
          if (error instanceof UnauthorizedError) {
            hooks.onAuthFailure?.();
          }
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          gcTime: 5 * 60_000,
          retry: (failureCount, error) => {
            if (error instanceof UnauthorizedError) return false;
            return failureCount < 1;
          },
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return cached;
}

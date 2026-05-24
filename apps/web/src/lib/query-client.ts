/**
 * Singleton QueryClient factory.
 *
 * Module-level cache survives React 19 strict-mode double-renders in
 * dev so route loaders and component subscribers share the exact same
 * client instance. Defaults pin server-state semantics PRD §7.7.5
 * names: 30s stale window, 5min GC, single retry. Mutations stay at
 * library default (no retry) — `apiMutate`'s `Idempotency-Key` makes
 * client-driven retry the caller's job.
 */
import { QueryClient } from "@tanstack/react-query";

let cached: QueryClient | undefined;

export function makeQueryClient(): QueryClient {
  if (!cached) {
    cached = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          gcTime: 5 * 60_000,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return cached;
}

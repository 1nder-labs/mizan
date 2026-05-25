/**
 * Query-options factories for case-related reads. Keeps the call site
 * (route loader + component) sharing one queryFn / queryKey pair so
 * the loader prefetch and the component subscriber hit the same
 * cache entry.
 *
 * Compile-time worker-drift detection lives in
 * `apps/web/tests/contract/app-type-snapshot.test.ts` (bidirectional
 * `Equal<>` over `InferResponseType<...>` vs the shared response
 * schemas). No redundant local `extends` seam — single source of truth.
 *
 * 401 handling: every read wrapper throws `UnauthorizedError` on 401
 * so loaders / `requireSession` can map it to a `/login` redirect via
 * TanStack Router instead of degrading to a generic "Failed to load"
 * notice that leaves the reviewer stranded on a protected route.
 */
import { queryOptions } from "@tanstack/react-query";
import {
  CaseDetailResponseSchema,
  QueueResponseSchema,
  type CaseDetailResponse,
  type QueueResponse,
  type QueueSearch,
} from "@mizan/shared";
import { api } from "./rpc.ts";
import { queryKeys } from "./query-keys.ts";

export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Session expired") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

function assertAuthorized(status: number): void {
  if (status === 401 || status === 403) throw new UnauthorizedError();
}

function toQuery(search: QueueSearch): Record<string, string> {
  const query: Record<string, string> = {
    page: String(search.page),
    sort: search.sort,
  };
  if (search.status) query.status = search.status;
  if (search.category) query.category = search.category;
  if (search.geography) query.geography = search.geography;
  return query;
}

async function fetchCases(search: QueueSearch): Promise<QueueResponse> {
  const res = await api.cases.$get({ query: toQuery(search) });
  assertAuthorized(res.status);
  if (!res.ok) throw new Error(`cases list failed: ${res.status}`);
  const json = await res.json();
  return QueueResponseSchema.parse(json);
}

export function casesListQueryOptions(search: QueueSearch) {
  return queryOptions<QueueResponse>({
    queryKey: queryKeys.cases.list(search),
    queryFn: () => fetchCases(search),
    staleTime: 15_000,
  });
}

async function fetchCase(id: string): Promise<CaseDetailResponse> {
  const res = await api.cases[":id"].$get({ param: { id } });
  assertAuthorized(res.status);
  if (!res.ok) throw new Error(`case fetch failed: ${res.status}`);
  const json = await res.json();
  return CaseDetailResponseSchema.parse(json);
}

export function caseDetailQueryOptions(id: string) {
  return queryOptions<CaseDetailResponse>({
    queryKey: queryKeys.cases.detail(id),
    queryFn: () => fetchCase(id),
    staleTime: 5_000,
  });
}

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
 * Auth-failure split: 401 → `UnauthorizedError` (session expired,
 * bounce to `/login`); 403 → `ForbiddenError` (authenticated but
 * lacks the required role, e.g. reviewer hitting admin/audit). The
 * 401 → /login pipeline in `query-client.ts` only redirects on
 * `UnauthorizedError` so a 403 surfaces as an in-place error UI on
 * the protected route instead of yanking the user back through login.
 */
import { queryOptions } from "@tanstack/react-query";
import {
  ActionErrorBodySchema,
  CaseDetailResponseSchema,
  QueueResponseSchema,
  ReviewerActionResponseSchema,
  type ActionErrorCode,
  type CaseDetailResponse,
  type QueueResponse,
  type QueueSearch,
  type ReviewerActionRequest,
  type ReviewerActionResponse,
} from "@mizan/shared";
import { api, apiMutate } from "./rpc.ts";
import { queryKeys } from "./query-keys.ts";
import { assertAuthorized, ReviewerActionError } from "./api-errors.ts";

export {
  ReviewerActionError,
  UnauthorizedError,
  ForbiddenError,
  assertAuthorized,
} from "./api-errors.ts";

function toQuery(search: QueueSearch): Record<string, string> {
  const query: Record<string, string> = {
    page: String(search.page),
    sort: search.sort,
  };
  if (search.status) query.status = search.status;
  if (search.category) query.category = search.category;
  if (search.geography) query.geography = search.geography;
  if (search.assignee) query.assignee = search.assignee;
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

async function readActionErrorCode(raw: unknown): Promise<ActionErrorCode | undefined> {
  const parsed = ActionErrorBodySchema.safeParse(raw);
  return parsed.success ? parsed.data.error : undefined;
}

export async function submitReviewerAction(
  caseId: string,
  body: ReviewerActionRequest,
): Promise<ReviewerActionResponse> {
  const res = await apiMutate.cases[":id"].action.$post({
    param: { id: caseId },
    json: body,
  });
  assertAuthorized(res.status);
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null);
    const code = await readActionErrorCode(raw);
    throw new ReviewerActionError(code ?? "workflow_failed", res.status);
  }
  const json = await res.json();
  return ReviewerActionResponseSchema.parse(json);
}

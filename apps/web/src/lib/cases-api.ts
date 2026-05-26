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

/**
 * Typed `Error` subclass carrying the server's `ActionErrorCode`
 * discriminator so callers can `instanceof` + switch on `.code`
 * instead of string-matching `error.message`.
 */
export class ReviewerActionError extends Error {
  readonly code: ActionErrorCode;
  readonly status: number;
  constructor(code: ActionErrorCode, status: number) {
    super(code);
    this.name = "ReviewerActionError";
    this.code = code;
    this.status = status;
  }
}

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

export function assertAuthorized(status: number): void {
  if (status === 401) throw new UnauthorizedError();
  if (status === 403) throw new ForbiddenError();
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

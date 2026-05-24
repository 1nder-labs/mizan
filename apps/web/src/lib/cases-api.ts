/**
 * Query-options factories for case-related reads. Keeps the call site
 * (route loader + component) sharing one queryFn / queryKey pair so
 * the loader prefetch and the component subscriber hit the same
 * cache entry.
 */
import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import {
  CaseDetailResponseSchema,
  QueueResponseSchema,
  type BriefPayload,
  type CaseDetailResponse,
  type CaseRow,
  type QueueResponse,
  type QueueSearch,
} from "@mizan/shared";
import { api } from "./rpc.ts";
import { queryKeys } from "./query-keys.ts";

/**
 * Compile-time seam: if the worker's `GET /api/cases/:id` response
 * diverges from `CaseDetailResponse`, this assignment fails to compile.
 * This catches worker drift at the RPC boundary before zod parse failures
 * surface at runtime.
 */
declare const _detailContract: InferResponseType<
  (typeof api.cases)[":id"]["$get"]
> extends CaseDetailResponse
  ? true
  : false;

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

interface CaseDetail {
  readonly case: CaseRow;
  readonly brief: CaseDetailResponse["brief"];
  readonly briefPayload: BriefPayload | null;
}

async function fetchCase(id: string): Promise<CaseDetail> {
  const res = await api.cases[":id"].$get({ param: { id } });
  if (!res.ok) throw new Error(`case fetch failed: ${res.status}`);
  const json = await res.json();
  const parsed = CaseDetailResponseSchema.parse(json);
  return {
    case: parsed.case,
    brief: parsed.brief,
    briefPayload: parsed.brief?.payload_json ?? null,
  };
}

export function caseDetailQueryOptions(id: string) {
  return queryOptions<CaseDetail>({
    queryKey: queryKeys.cases.detail(id),
    queryFn: () => fetchCase(id),
    staleTime: 5_000,
  });
}

/**
 * Query-options factories for case-related reads. Keeps the call site
 * (route loader + component) sharing one queryFn / queryKey pair so
 * the loader prefetch and the component subscriber hit the same
 * cache entry.
 */
import { queryOptions } from "@tanstack/react-query";
import {
  BriefPayloadSchema,
  CaseRowSchema,
  QueueResponseSchema,
  type BriefPayload,
  type CaseRow,
  type QueueResponse,
  type QueueSearch,
} from "@mizan/shared";
import { z } from "zod";
import { api } from "./rpc.ts";
import { queryKeys } from "./query-keys.ts";

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

const BriefRecommendationEnum = z.enum(["READY_FOR_REVIEW", "REQUEST_DOCS", "ESCALATE", "BLOCK"]);

const BriefSummarySchema = z.object({
  recommendation: BriefRecommendationEnum,
  confidence: z.number().int(),
  composed_at: z.number().int(),
  payload_json: BriefPayloadSchema,
});

type BriefSummary = z.infer<typeof BriefSummarySchema>;

const CaseDetailResponseSchema = z.object({
  case: CaseRowSchema,
  brief: BriefSummarySchema.nullable(),
});

interface CaseDetail {
  readonly case: CaseRow;
  readonly brief: BriefSummary | null;
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

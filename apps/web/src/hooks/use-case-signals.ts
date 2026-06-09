/**
 * React Query hook for `GET /api/cases/:id/signals`.
 *
 * Latest persisted signal row per `signal_type`. Server returns rows
 * ordered by `recorded_at` desc; the response schema is a
 * discriminated union so each row's `payload_json` lands typed.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { CaseSignalsResponseSchema, type CaseSignalsResponse } from "@mizan/shared";
import { api } from "@/lib/rpc.ts";
import { assertAuthorized } from "@/lib/cases-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";

async function fetchCaseSignals(caseId: string): Promise<CaseSignalsResponse> {
  const res = await api.cases[":id"].signals.$get({ param: { id: caseId } });
  assertAuthorized(res.status);
  if (!res.ok) throw new Error(`signals fetch failed: ${res.status}`);
  const json = await res.json();
  return CaseSignalsResponseSchema.parse(json);
}

export function useCaseSignals(caseId: string): UseQueryResult<CaseSignalsResponse, Error> {
  return useQuery<CaseSignalsResponse, Error>({
    queryKey: queryKeys.signals.detail(caseId),
    queryFn: () => fetchCaseSignals(caseId),
    staleTime: 30_000,
  });
}

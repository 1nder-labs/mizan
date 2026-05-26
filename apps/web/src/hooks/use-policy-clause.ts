/**
 * React Query hook for `GET /api/policy/clauses/:id?source=zakat|safety`.
 *
 * `enabled` defers the fetch until the citation drawer mounts; the
 * cache key includes both `source` and `clauseId` so a chip in one
 * source never resolves to the other source's clause.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  PolicyClauseErrorBodySchema,
  PolicyClauseResponseSchema,
  type PolicyClauseErrorCode,
  type PolicyClauseResponse,
  type PolicyClauseSource,
} from "@mizan/shared";
import { api } from "@/lib/rpc.ts";
import { assertAuthorized } from "@/lib/cases-api.ts";

export class PolicyClauseError extends Error {
  readonly code: PolicyClauseErrorCode;
  readonly status: number;
  constructor(code: PolicyClauseErrorCode, status: number) {
    super(code);
    this.name = "PolicyClauseError";
    this.code = code;
    this.status = status;
  }
}

async function fetchPolicyClause(
  clauseId: string,
  source: PolicyClauseSource,
): Promise<PolicyClauseResponse> {
  const res = await api.policy.clauses[":id"].$get({
    param: { id: clauseId },
    query: { source },
  });
  assertAuthorized(res.status);
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null);
    const parsed = PolicyClauseErrorBodySchema.safeParse(raw);
    throw new PolicyClauseError(parsed.success ? parsed.data.error : "not_found", res.status);
  }
  const json = await res.json();
  return PolicyClauseResponseSchema.parse(json);
}

export function usePolicyClause(
  clauseId: string,
  source: PolicyClauseSource,
  enabled: boolean,
): UseQueryResult<PolicyClauseResponse, PolicyClauseError | Error> {
  return useQuery<PolicyClauseResponse, PolicyClauseError | Error>({
    queryKey: ["policy-clause", source, clauseId],
    queryFn: () => fetchPolicyClause(clauseId, source),
    enabled,
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });
}

/**
 * Query-options factory for the admin audit list.
 */
import { queryOptions } from "@tanstack/react-query";
import { AuditListResponseSchema, type AuditListSearch } from "@mizan/shared";
import { api } from "./rpc.ts";
import { queryKeys } from "./query-keys.ts";
import { apiError, assertAuthorized } from "./cases-api.ts";

async function fetchAuditList(search: AuditListSearch) {
  const res = await api.admin.audit.$get({
    query: {
      page: String(search.page),
      page_size: String(search.page_size),
    },
  });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  const json = await res.json();
  return AuditListResponseSchema.parse(json);
}

export function auditListQueryOptions(search: AuditListSearch) {
  return queryOptions({
    queryKey: [...queryKeys.audit.all, search] as const,
    queryFn: () => fetchAuditList(search),
    staleTime: 15_000,
  });
}

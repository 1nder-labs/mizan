/**
 * Query-options factories + mutation helpers for reviewer-side case notes.
 * Mirrors `portal-api.ts` pattern: every read runs `assertAuthorized` before
 * the shared-schema parse; every write throws on non-ok so call sites
 * can handle via `useMutation.onError`.
 *
 * Auth-failure split: 401 → `UnauthorizedError` (bounced to /login via
 * `query-client.ts`); 403 → `ForbiddenError` (in-place error on the route).
 */
import { queryOptions } from "@tanstack/react-query";
import { CaseNotesResponseSchema, type CaseNotesResponse } from "@mizan/shared";
import { api, apiMutate } from "./rpc.ts";
import { queryKeys } from "./query-keys.ts";
import { assertAuthorized } from "./api-errors.ts";

async function fetchCaseNotes(caseId: string): Promise<CaseNotesResponse> {
  const res = await api.cases[":id"].notes.$get({ param: { id: caseId } });
  assertAuthorized(res.status);
  if (!res.ok) throw new Error(`case notes fetch failed: ${res.status}`);
  return CaseNotesResponseSchema.parse(await res.json());
}

export function caseNotesQueryOptions(caseId: string) {
  return queryOptions<CaseNotesResponse>({
    queryKey: queryKeys.cases.notes(caseId),
    queryFn: () => fetchCaseNotes(caseId),
    staleTime: 10_000,
  });
}

export async function postClientMessage(caseId: string, body: string): Promise<void> {
  const res = await apiMutate.cases[":id"].notes.message.$post({
    param: { id: caseId },
    json: { body },
  });
  assertAuthorized(res.status);
  if (!res.ok) throw new Error(`post client message failed: ${res.status}`);
}

export async function postInternalNote(caseId: string, body: string): Promise<void> {
  const res = await apiMutate.cases[":id"].notes.internal.$post({
    param: { id: caseId },
    json: { body },
  });
  assertAuthorized(res.status);
  if (!res.ok) throw new Error(`post internal note failed: ${res.status}`);
}

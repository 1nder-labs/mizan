/**
 * Query-options factories + mutations for the client portal. Mirrors
 * `cases-api.ts`: each read shares one queryFn/queryKey pair so the route
 * loader prefetch and the component subscriber hit the same cache entry, and
 * every response runs `assertAuthorized` (401 → /login, 403 → in-place error)
 * before the shared-schema parse.
 */
import { queryOptions } from "@tanstack/react-query";
import {
  CampaignMutationResponseSchema,
  CaseNotesResponseSchema,
  ClientCampaignsResponseSchema,
  ClientCaseDetailSchema,
  EvidenceUploadResponseSchema,
  type CampaignCreate,
  type CampaignMutationResponse,
  type CaseNotesResponse,
  type ClientCampaignsResponse,
  type ClientCaseDetail,
  type DocumentKey,
  type EvidenceUploadResponse,
} from "@mizan/shared";
import { api, apiMutate, postMultipart } from "./rpc.ts";
import { queryKeys } from "./query-keys.ts";
import { apiError, assertAuthorized } from "./api-errors.ts";

async function fetchCampaigns(): Promise<ClientCampaignsResponse> {
  const res = await api.portal.campaigns.$get();
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return ClientCampaignsResponseSchema.parse(await res.json());
}

export function clientCampaignsQueryOptions() {
  return queryOptions<ClientCampaignsResponse>({
    queryKey: queryKeys.portal.campaigns(),
    queryFn: fetchCampaigns,
    staleTime: 15_000,
  });
}

async function fetchCampaign(id: string): Promise<ClientCaseDetail> {
  const res = await api.portal.campaigns[":id"].$get({ param: { id } });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return ClientCaseDetailSchema.parse(await res.json());
}

export function clientCampaignQueryOptions(id: string) {
  return queryOptions<ClientCaseDetail>({
    queryKey: queryKeys.portal.campaign(id),
    queryFn: () => fetchCampaign(id),
    staleTime: 5_000,
  });
}

async function fetchNotes(id: string): Promise<CaseNotesResponse> {
  const res = await api.portal.campaigns[":id"].notes.$get({ param: { id } });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return CaseNotesResponseSchema.parse(await res.json());
}

export function clientCampaignNotesQueryOptions(id: string) {
  return queryOptions<CaseNotesResponse>({
    queryKey: queryKeys.portal.notes(id),
    queryFn: () => fetchNotes(id),
    staleTime: 5_000,
  });
}

export async function createCampaign(body: CampaignCreate): Promise<CampaignMutationResponse> {
  const res = await apiMutate.portal.campaigns.$post({ json: body });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return CampaignMutationResponseSchema.parse(await res.json());
}

export async function editCampaign(
  id: string,
  body: CampaignCreate,
): Promise<CampaignMutationResponse> {
  const res = await apiMutate.portal.campaigns[":id"].$patch({ param: { id }, json: body });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return CampaignMutationResponseSchema.parse(await res.json());
}

/** Submits a draft for review (`POST /:id/submit`). Idempotent: a re-submit is a 200 no-op. */
export async function submitCampaign(id: string): Promise<CampaignMutationResponse> {
  const res = await apiMutate.portal.campaigns[":id"].submit.$post({ param: { id } });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return CampaignMutationResponseSchema.parse(await res.json());
}

/** Hard-deletes an unsubmitted draft (`DELETE /:id`). 409 once submitted. */
export async function deleteCampaign(id: string): Promise<void> {
  const res = await apiMutate.portal.campaigns[":id"].$delete({ param: { id } });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
}

/**
 * Evidence upload is multipart — the worker route reads it with `parseBody`,
 * not a typed form validator, so the Hono RPC client cannot type it. The raw
 * request goes through `postMultipart` so `lib/rpc.ts` stays the only module
 * that issues `fetch`; this layer keeps the FormData shape + response parse.
 */
export async function uploadEvidence(
  id: string,
  docKind: DocumentKey,
  file: File,
): Promise<EvidenceUploadResponse> {
  const form = new FormData();
  form.append("docKind", docKind);
  form.append("file", file);
  const res = await postMultipart(`/portal/campaigns/${id}/evidence`, form);
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return EvidenceUploadResponseSchema.parse(await res.json());
}

/**
 * Document-access API: the versioned document list + per-document view URL, for
 * both the reviewer (`/api/cases/:id/documents…`) and client portal
 * (`/api/portal/campaigns/:id/documents…`) surfaces. List reads share a
 * queryFn/queryKey pair; the by-id URL fetchers are called on demand when a
 * viewer dialog opens.
 */
import { queryOptions } from "@tanstack/react-query";
import {
  DocumentFileUrlResponseSchema,
  DocumentsListResponseSchema,
  type DocumentFileUrlResponse,
  type DocumentsListResponse,
} from "@mizan/shared";
import { api } from "./rpc.ts";
import { queryKeys } from "./query-keys.ts";
import { apiError, assertAuthorized } from "./api-errors.ts";

async function fetchCaseDocuments(id: string): Promise<DocumentsListResponse> {
  const res = await api.cases[":id"].documents.$get({ param: { id } });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return DocumentsListResponseSchema.parse(await res.json());
}

export function caseDocumentsQueryOptions(id: string) {
  return queryOptions<DocumentsListResponse>({
    queryKey: queryKeys.cases.documents(id),
    queryFn: () => fetchCaseDocuments(id),
    staleTime: 5_000,
  });
}

export async function fetchCaseDocumentUrl(
  id: string,
  docId: string,
): Promise<DocumentFileUrlResponse> {
  const res = await api.cases[":id"].documents.by[":docId"].url.$get({ param: { id, docId } });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return DocumentFileUrlResponseSchema.parse(await res.json());
}

async function fetchCampaignDocuments(id: string): Promise<DocumentsListResponse> {
  const res = await api.portal.campaigns[":id"].documents.$get({ param: { id } });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return DocumentsListResponseSchema.parse(await res.json());
}

export function clientCampaignDocumentsQueryOptions(id: string) {
  return queryOptions<DocumentsListResponse>({
    queryKey: queryKeys.portal.documents(id),
    queryFn: () => fetchCampaignDocuments(id),
    staleTime: 5_000,
  });
}

/**
 * Same-origin auth-gated raw path for a client document. Fed as the `url` to the
 * shared `DocumentViewerDialog` (PDF / image inline) — the client views their
 * own low-volume uploads in-app via the Worker, no presign round-trip needed.
 */
export function clientDocumentRawPath(campaignId: string, docId: string): string {
  return `/api/portal/campaigns/${campaignId}/documents/${docId}/raw`;
}

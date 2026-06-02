/**
 * React Query hook for `GET /api/cases/:id/documents/:docKey/url`.
 *
 * Lazy: `enabled` controls when the fetch fires (consumer opens a
 * document dialog). Caches at `staleTime: 240s` (presigned URL TTL is
 * 300s — refetch 1 minute before expiry so dialogs that stay open
 * never serve a stale URL).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  DocumentUrlErrorBodySchema,
  DocumentUrlResponseSchema,
  type DocumentKey,
  type DocumentUrlErrorCode,
  type DocumentUrlResponse,
} from "@mizan/shared";
import { api } from "@/lib/rpc.ts";
import { assertAuthorized } from "@/lib/cases-api.ts";

export class DocumentUrlError extends Error {
  readonly code: DocumentUrlErrorCode;
  readonly status: number;
  constructor(code: DocumentUrlErrorCode, status: number) {
    super(code);
    this.name = "DocumentUrlError";
    this.code = code;
    this.status = status;
  }
}

async function fetchDocumentUrl(caseId: string, docKey: DocumentKey): Promise<DocumentUrlResponse> {
  const res = await api.cases[":id"].documents[":docKey"].url.$get({
    param: { id: caseId, docKey },
  });
  assertAuthorized(res.status);
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null);
    const parsed = DocumentUrlErrorBodySchema.safeParse(raw);
    throw new DocumentUrlError(parsed.success ? parsed.data.error : "not_ready", res.status);
  }
  const json = await res.json();
  return DocumentUrlResponseSchema.parse(json);
}

export function useDocumentUrl(
  caseId: string,
  docKey: DocumentKey,
  enabled: boolean,
): UseQueryResult<DocumentUrlResponse, DocumentUrlError | Error> {
  return useQuery<DocumentUrlResponse, DocumentUrlError | Error>({
    queryKey: ["document-url", caseId, docKey],
    queryFn: () => fetchDocumentUrl(caseId, docKey),
    enabled,
    staleTime: 240_000,
    retry: 0,
  });
}

import { z } from "zod";

/**
 * Every document kind. The first three mirror `DocumentKeyEnum` — the
 * name-bound extraction slots — plus `supplementary` for reviewer-facing
 * evidence the client adds that is never auto-extracted. Mirrors
 * `DOCUMENT_KIND_VALUES` in `@mizan/db/schema.ts`; parity is pinned by
 * `apps/worker/tests/unit/db-schemas.test.ts`.
 */
export const DocumentKindEnum = z.enum([
  "creator_id",
  "bank_statement",
  "category_doc",
  "supplementary",
]);

export type DocumentKind = z.infer<typeof DocumentKindEnum>;

/**
 * One stored document in a case's evidence list. `is_current` marks the latest
 * upload for its slot (always true for `supplementary`, which has no versioning
 * semantics). `uploaded_at` is epoch millis.
 */
export const DocumentSummarySchema = z.object({
  id: z.string(),
  doc_kind: DocumentKindEnum,
  filename: z.string(),
  content_type: z.string(),
  uploaded_at: z.number().int(),
  is_current: z.boolean(),
});

export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

/** Response for the document-list endpoints — newest upload first. */
export const DocumentsListResponseSchema = z.object({
  documents: z.array(DocumentSummarySchema),
});

export type DocumentsListResponse = z.infer<typeof DocumentsListResponseSchema>;

/**
 * Response for the by-id file-URL endpoints. `url` is a short-TTL presigned R2
 * URL in production, or a same-origin raw-serve path in local dev.
 */
export const DocumentFileUrlResponseSchema = z.object({
  url: z.string(),
  expiresInSeconds: z.number().int(),
  contentType: z.string(),
});

export type DocumentFileUrlResponse = z.infer<typeof DocumentFileUrlResponseSchema>;

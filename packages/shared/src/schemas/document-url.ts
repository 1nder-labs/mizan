import { z } from "zod";

/**
 * Response + error contracts for `GET /api/cases/:id/documents/:docKey/url`.
 * `docKey` is a closed enum that maps 1:1 to `CaseOverlay.r2_keys` fields.
 * The Worker signs an R2 presigned GET URL via `aws4fetch` and returns it
 * with a TTL hint; the browser fetches the URL directly (Worker stays
 * out of the doc-bytes path).
 */
export const DocumentKeyEnum = z.enum(["creator_id", "bank_statement", "category_doc"]);

export const DocumentUrlResponseSchema = z
  .object({
    url: z.string().url(),
    expiresInSeconds: z.number().int().min(60).max(3600),
    docKey: DocumentKeyEnum,
  })
  .strict();

export const DocumentUrlErrorCodeEnum = z.enum([
  "not_found",
  "no_run",
  "not_ready",
  "invalid_doc_key",
]);

export const DocumentUrlErrorBodySchema = z
  .object({
    error: DocumentUrlErrorCodeEnum,
  })
  .strict();

export type DocumentKey = z.infer<typeof DocumentKeyEnum>;
export type DocumentUrlResponse = z.infer<typeof DocumentUrlResponseSchema>;
export type DocumentUrlErrorCode = z.infer<typeof DocumentUrlErrorCodeEnum>;
export type DocumentUrlErrorBody = z.infer<typeof DocumentUrlErrorBodySchema>;

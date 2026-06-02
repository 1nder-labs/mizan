import { z } from "zod";

/**
 * Response + error contracts for `GET /api/cases/:id/documents/:docKey/url`.
 * `docKey` is a closed enum that maps 1:1 to `CaseOverlay.r2_keys` fields.
 * The Worker signs an R2 presigned GET URL via `aws4fetch` and returns it
 * with a TTL hint; the browser fetches the URL directly (Worker stays
 * out of the doc-bytes path).
 */
export const DocumentKeyEnum = z.enum(["creator_id", "bank_statement", "category_doc"]);

/**
 * A document URL is either a remote presigned R2 URL (production) or a
 * same-origin raw-serve path like `/api/cases/:id/documents/:docKey/raw`
 * (local dev, where Miniflare R2 has no presign endpoint). Both go straight
 * into an `<img>`/`<embed>` `src`, which resolves a root-relative path against
 * the page origin.
 */
const DocumentSrcSchema = z
  .string()
  .min(1)
  .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), {
    message: "must be an absolute http(s) URL or a root-relative path",
  });

export const DocumentUrlResponseSchema = z
  .object({
    url: DocumentSrcSchema,
    expiresInSeconds: z.number().int().min(60).max(3600),
    docKey: DocumentKeyEnum,
  })
  .strict();

export const DocumentUrlErrorCodeEnum = z.enum([
  "not_found",
  "no_run",
  "not_ready",
  "invalid_doc_key",
  "storage_unconfigured",
  "presign_failed",
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

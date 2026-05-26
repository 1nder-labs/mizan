import { z } from "zod";

/**
 * Response shape for `GET /api/policy/clauses/:id?source=zakat|safety`.
 * The route consults the bundled corpus JSON via
 * `@mizan/mastra/getClauseById` and returns the full clause body so the
 * citation drawer (Phase 7.5 U12) renders the complete text — not the
 * ~200-char excerpt that `composeBrief` writes into `policy_citations[]`.
 */
export const PolicyClauseSourceEnum = z.enum(["zakat", "safety"]);

export const PolicyClauseResponseSchema = z
  .object({
    clauseId: z.string().min(1),
    source: PolicyClauseSourceEnum,
    title: z.string().min(1),
    body: z.string().min(1),
    corpusVersion: z.string().min(1),
  })
  .strict();

export const PolicyClauseQuerySchema = z
  .object({
    source: PolicyClauseSourceEnum,
  })
  .strict();

export const PolicyClauseErrorCodeEnum = z.enum(["not_found", "invalid_source"]);

export const PolicyClauseErrorBodySchema = z
  .object({
    error: PolicyClauseErrorCodeEnum,
  })
  .strict();

export type PolicyClauseSource = z.infer<typeof PolicyClauseSourceEnum>;
export type PolicyClauseResponse = z.infer<typeof PolicyClauseResponseSchema>;
export type PolicyClauseQuery = z.infer<typeof PolicyClauseQuerySchema>;
export type PolicyClauseErrorCode = z.infer<typeof PolicyClauseErrorCodeEnum>;
export type PolicyClauseErrorBody = z.infer<typeof PolicyClauseErrorBodySchema>;

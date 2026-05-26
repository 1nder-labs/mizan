import { z } from "zod";

/** Phase 7.6 U3 — assignment request + response shapes. */

export const CaseAssignRequestSchema = z
  .object({
    user_id: z.string().nullable(),
  })
  .strict();

export const CaseAssignResponseSchema = z
  .object({
    case_id: z.string().uuid(),
    assigned_to: z.string().nullable(),
  })
  .strict();

export const CaseAssignErrorCodeEnum = z.enum([
  "not_found",
  "forbidden",
  "invalid_user",
  "self_assign_only",
]);

export const CaseAssignErrorBodySchema = z.object({ error: CaseAssignErrorCodeEnum }).strict();

export type CaseAssignRequest = z.infer<typeof CaseAssignRequestSchema>;
export type CaseAssignResponse = z.infer<typeof CaseAssignResponseSchema>;
export type CaseAssignErrorCode = z.infer<typeof CaseAssignErrorCodeEnum>;
export type CaseAssignErrorBody = z.infer<typeof CaseAssignErrorBodySchema>;

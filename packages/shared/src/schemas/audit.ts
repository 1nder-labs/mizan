import { z } from "zod";
import { CaseStatusEnum } from "./queue-search.ts";
import { ReviewerActionEnum } from "./reviewer-action.ts";

/** URL search params for `/admin/audit`. */
export const AuditListSearchSchema = z
  .object({
    page: z.coerce.number().int().positive().max(1000).default(1).catch(1),
    page_size: z.coerce.number().int().positive().max(100).default(25).catch(25),
  })
  .strict();

export type AuditListSearch = z.infer<typeof AuditListSearchSchema>;

/**
 * Display-side truncation cap for the audit list's `rationale` cell.
 * Mirrors `RATIONALE_MAX` in `packages/db/src/audit.ts:10` — the DB
 * query truncates anything longer; the schema must declare the same
 * bound so the contract does not lie to clients.
 */
export const AUDIT_RATIONALE_DISPLAY_MAX = 280;

/** Single audit row in the admin list projection. */
export const AuditEntrySchema = z.object({
  id: z.string().uuid(),
  case_id: z.string().uuid(),
  case_status: CaseStatusEnum,
  case_category: z.string(),
  reviewer_email: z.string().nullable(),
  action: ReviewerActionEnum,
  rationale: z.string().max(AUDIT_RATIONALE_DISPLAY_MAX),
  acted_at: z.number().int(),
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const AuditListResponseSchema = z.object({
  entries: z.array(AuditEntrySchema),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;

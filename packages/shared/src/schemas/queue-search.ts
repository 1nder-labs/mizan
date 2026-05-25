import { z } from "zod";
import { RecommendationEnum, VerificationPathSchema } from "./brief.ts";

export const CASE_STATUS_VALUES = [
  "DRAFT",
  "QUEUED",
  "RUNNING",
  "SUSPENDED_HITL",
  "READY_FOR_REVIEW",
  "ACTIONED",
  "FAILED",
] as const;

export const CaseStatusEnum = z.enum(CASE_STATUS_VALUES);
export type CaseStatus = z.infer<typeof CaseStatusEnum>;

export const QueueSortEnum = z.enum(["updated_desc", "updated_asc", "created_desc"]);
export type QueueSort = z.infer<typeof QueueSortEnum>;

/**
 * URL-search-param contract for `/queue`. `.coerce.number` parses
 * the string-typed query values; `.catch(default)` keeps a malformed
 * URL from crashing the loader — the page falls back to defaults
 * and renders cleanly.
 */
export const QueueSearchSchema = z
  .object({
    status: CaseStatusEnum.optional().catch(undefined),
    category: z.string().min(1).max(64).optional().catch(undefined),
    geography: z.string().min(1).max(64).optional().catch(undefined),
    page: z.coerce.number().int().positive().max(1000).default(1).catch(1),
    sort: QueueSortEnum.default("updated_desc").catch("updated_desc"),
  })
  .strict();

export type QueueSearch = z.infer<typeof QueueSearchSchema>;

/**
 * Denormalized projection of the latest brief's recommendation +
 * verification path so the queue surface can render those columns
 * without a per-row N+1. Null when the case has no brief yet
 * (DRAFT / QUEUED rows).
 */
export const LatestBriefProjectionSchema = z.object({
  recommendation: RecommendationEnum,
  verification_path: VerificationPathSchema,
});

export type LatestBriefProjection = z.infer<typeof LatestBriefProjectionSchema>;

export const CaseRowSchema = z.object({
  id: z.string().uuid(),
  status: CaseStatusEnum,
  category: z.string(),
  geography: z.string(),
  claimed_zakat_category: z.string().nullable(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  latest_brief: LatestBriefProjectionSchema.nullable(),
});
export type CaseRow = z.infer<typeof CaseRowSchema>;

export const QueueResponseSchema = z.object({
  cases: z.array(CaseRowSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type QueueResponse = z.infer<typeof QueueResponseSchema>;

export const QUEUE_PAGE_SIZE = 25;

export const DEFAULT_QUEUE_SEARCH: QueueSearch = {
  page: 1,
  sort: "updated_desc",
};

export function isCaseStatus(value: string): value is CaseStatus {
  for (const candidate of CASE_STATUS_VALUES) {
    if (candidate === value) return true;
  }
  return false;
}

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

export const QueueViewEnum = z.enum(["board", "table"]);
export type QueueView = z.infer<typeof QueueViewEnum>;

/**
 * `?assignee=` selects which cases the queue list returns.
 *   - `me` (default for reviewer role) — cases assigned to the current
 *     user OR unassigned (claimable).
 *   - `unassigned` — only unassigned cases.
 *   - `all` (default for admin) — every case regardless of assignment.
 *   - a user-id string — admin filter to inspect another reviewer's
 *     queue.
 */
export const QueueAssigneeFilterEnum = z.union([
  z.literal("me"),
  z.literal("unassigned"),
  z.literal("all"),
  z.string().min(1),
]);
export type QueueAssigneeFilter = z.infer<typeof QueueAssigneeFilterEnum>;

/**
 * URL-search-param contract for `/queue`. `.coerce.number` parses
 * the string-typed query values; `.catch(default)` keeps a malformed
 * URL from crashing the loader — the page falls back to defaults
 * and renders cleanly.
 *
 * `view` selects the rendering surface — `board` (Kanban, default) or
 * `table` (the original high-density list). Persisted in the URL so a
 * deep link / refresh / bookmark preserves the reviewer's choice.
 */
export const QueueSearchSchema = z
  .object({
    status: CaseStatusEnum.optional().catch(undefined),
    title: z.string().min(1).max(120).optional().catch(undefined),
    category: z.string().min(1).max(64).optional().catch(undefined),
    geography: z.string().min(1).max(64).optional().catch(undefined),
    page: z.coerce.number().int().positive().max(1000).default(1).catch(1),
    sort: QueueSortEnum.default("updated_desc").catch("updated_desc"),
    view: QueueViewEnum.default("board").catch("board"),
    assignee: QueueAssigneeFilterEnum.optional().catch(undefined),
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
  title: z.string(),
  category: z.string(),
  geography: z.string(),
  claimed_zakat_category: z.string().nullable(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  latest_brief: LatestBriefProjectionSchema.nullable(),
  assigned_to: z.string().nullable(),
  /** True when the campaign was submitted by a `client` (vs seeded) — a queue triage signal. */
  client_submitted: z.boolean(),
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
  view: "board",
};

export const ASSIGNEE_QUERY_PARAM = "assignee";

export function isCaseStatus(value: string): value is CaseStatus {
  for (const candidate of CASE_STATUS_VALUES) {
    if (candidate === value) return true;
  }
  return false;
}

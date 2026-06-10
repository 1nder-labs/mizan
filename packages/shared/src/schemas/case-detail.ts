import { z } from "zod";
import { CaseRowSchema } from "./queue-search.ts";
import { BriefPayloadSchema, RecommendationEnum } from "./brief.ts";
import { CaseOverlaySchema } from "./case-overlay.ts";

/** Summary row from the `briefs` table joined to a case-detail fetch. */
export const BriefSummarySchema = z.object({
  recommendation: RecommendationEnum,
  confidence: z.number().int(),
  composed_at: z.number().int(),
  payload_json: BriefPayloadSchema,
});

export type BriefSummary = z.infer<typeof BriefSummarySchema>;

/**
 * Full response shape for `GET /api/cases/:id`.
 *
 * `overlay` carries the raw campaign material (`story`, `organizer_name`,
 * `r2_keys`, optional `vouching_narrative`) persisted to
 * `cases.brief_partial_json`. The reviewer UI surfaces this in the
 * Phase 7.5 story / documents panels so reviewers can verify AI
 * extractions against source text. `null` when the case is still in
 * DRAFT before the overlay seed runs.
 */
export const CaseDetailResponseSchema = z.object({
  case: CaseRowSchema,
  brief: BriefSummarySchema.nullable(),
  overlay: CaseOverlaySchema.nullable(),
  /** True when the case has been archived (BLOCK auto-archives, or a manual archive). */
  archived: z.boolean(),
});

export type CaseDetailResponse = z.infer<typeof CaseDetailResponseSchema>;

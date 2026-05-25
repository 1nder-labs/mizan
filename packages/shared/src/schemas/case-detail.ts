import { z } from "zod";
import { CaseRowSchema } from "./queue-search.ts";
import { BriefPayloadSchema, RecommendationEnum } from "./brief.ts";

/** Summary row from the `briefs` table joined to a case-detail fetch. */
export const BriefSummarySchema = z.object({
  recommendation: RecommendationEnum,
  confidence: z.number().int(),
  composed_at: z.number().int(),
  payload_json: BriefPayloadSchema,
});

export type BriefSummary = z.infer<typeof BriefSummarySchema>;

/** Full response shape for `GET /api/cases/:id`. */
export const CaseDetailResponseSchema = z.object({
  case: CaseRowSchema,
  brief: BriefSummarySchema.nullable(),
});

export type CaseDetailResponse = z.infer<typeof CaseDetailResponseSchema>;

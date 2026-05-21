import { z } from "zod";
import { ExtractionsSchema } from "./extractions/index.ts";
import { JsonRecordSchema } from "./json-value.ts";

export const RecommendationEnum = z.enum(["READY_FOR_REVIEW", "REQUEST_DOCS", "ESCALATE", "BLOCK"]);

export const MissingDocSchema = z.object({
  docType: z.string(),
  reason: z.string(),
});

export const ReviewerQuestionSchema = z.object({
  question: z.string(),
  suggestedAnswer: z.string().nullable(),
});

export const BriefPayloadSchema = z.object({
  recommendation: RecommendationEnum,
  missing_docs: z.array(MissingDocSchema),
  reviewer_questions: z.array(ReviewerQuestionSchema),
  extracted_claims: JsonRecordSchema,
  confidence: z.number(),
});

export type BriefPayload = z.infer<typeof BriefPayloadSchema>;

export const PartialBriefStateSchema = z.object({
  caseId: z.string(),
  runId: z.string(),
  classify: z
    .object({
      verification_path: z.enum(["documentary", "trust_signal", "hybrid"]),
    })
    .optional(),
  extractions: ExtractionsSchema.optional(),
  brief: BriefPayloadSchema.optional(),
});

export type PartialBriefState = z.infer<typeof PartialBriefStateSchema>;

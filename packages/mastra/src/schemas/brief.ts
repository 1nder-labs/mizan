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

/**
 * Single citation referencing a clause in `mizan-policy-corpus`.
 * `relevance` is a Vectorize cosine-similarity score clamped to [0,1] at the
 * matchPolicy boundary (not constrained in zod — strict LLM structured-output
 * mode rejects min/max on numbers).
 */
export const PolicyCitationSchema = z.object({
  clauseId: z.string(),
  source: z.enum(["zakat", "safety"]),
  excerpt: z.string(),
  relevance: z.number(),
});

export type PolicyCitation = z.infer<typeof PolicyCitationSchema>;

/** Reviewer brief payload — Phase 3 adds additive `policy_citations`. */
export const BriefPayloadSchema = z.object({
  recommendation: RecommendationEnum,
  missing_docs: z.array(MissingDocSchema),
  reviewer_questions: z.array(ReviewerQuestionSchema),
  extracted_claims: JsonRecordSchema,
  confidence: z.number(),
  policy_citations: PolicyCitationSchema.array(),
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
  policy_matches: PolicyCitationSchema.array().optional(),
  brief: BriefPayloadSchema.optional(),
});

export type PartialBriefState = z.infer<typeof PartialBriefStateSchema>;

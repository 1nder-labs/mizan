import { z } from "zod";
import { ExtractionsSchema } from "./extractions/index.ts";
import { JsonRecordSchema } from "./json-value.ts";
import { VouchingChainSchema } from "../steps/classifyVouchingChain/schema.ts";
import { PhotoSignalPayloadSchema } from "../steps/photoSignal/helpers.ts";

export const RecommendationEnum = z.enum(["READY_FOR_REVIEW", "REQUEST_DOCS", "ESCALATE", "BLOCK"]);

export const VerificationPathSchema = z.enum([
  "documentary",
  "institutional_vouching",
  "community_vouching",
  "none",
]);

export const GeographyTierSchema = z.enum(["SAFE", "AT_RISK", "OFAC_ADJACENT", "OFAC"]);

export type VerificationPath = z.infer<typeof VerificationPathSchema>;
export type GeographyTier = z.infer<typeof GeographyTierSchema>;

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

/** Reviewer-facing drafted missing-evidence ask (Phase 4). */
export const DraftedOrganizerMessageSchema = z.object({
  message: z.string(),
  missing_items: z.string().array(),
});

export type DraftedOrganizerMessage = z.infer<typeof DraftedOrganizerMessageSchema>;

/** Story coherence signal payload produced by `storyCoherence`. */
export const StoryCoherencePayloadSchema = z.object({
  named_entity_density: z.number(),
  template_match_score: z.number(),
  coherence_summary: z.string(),
});

export type StoryCoherencePayload = z.infer<typeof StoryCoherencePayloadSchema>;

/**
 * Reviewer brief payload — Phase 3 adds `policy_citations`; Phase 4 adds
 * optional `drafted_organizer_message` + `forced_escalate_reason`.
 */
export const BriefPayloadSchema = z.object({
  recommendation: RecommendationEnum,
  missing_docs: z.array(MissingDocSchema),
  reviewer_questions: z.array(ReviewerQuestionSchema),
  extracted_claims: JsonRecordSchema,
  confidence: z.number(),
  policy_citations: PolicyCitationSchema.array().default([]),
  drafted_organizer_message: DraftedOrganizerMessageSchema.optional(),
  forced_escalate_reason: z.string().optional(),
});

export type BriefPayload = z.infer<typeof BriefPayloadSchema>;

export const PartialBriefStateSchema = z.object({
  caseId: z.string(),
  runId: z.string(),
  classify: z
    .object({
      category: z.string().optional(),
      verification_path: VerificationPathSchema,
      geography_tier: GeographyTierSchema,
    })
    .optional(),
  extractions: ExtractionsSchema.optional(),
  policy_matches: PolicyCitationSchema.array().optional(),
  signals: z
    .object({
      photo: PhotoSignalPayloadSchema.optional(),
      story: StoryCoherencePayloadSchema.optional(),
      vouching: VouchingChainSchema.optional(),
    })
    .optional(),
  brief: BriefPayloadSchema.optional(),
});

export type PartialBriefState = z.infer<typeof PartialBriefStateSchema>;

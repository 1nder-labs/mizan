import { z } from "zod";
import { ExtractionsSchema } from "./extractions/index.ts";
import { VouchingChainSchema } from "./vouching.ts";
import { PhotoSignalPayloadSchema } from "./photo-signal.ts";

/*
 * LLM-output schemas in this file follow the cross-provider strict-mode
 * common subset (Anthropic + OpenAI 2026-04-30):
 *
 * - No `minLength` / `maxLength` keywords (use `.describe()` instead)
 * - No `propertyNames` / non-`false` `additionalProperties`
 * - No `oneOf` (use `z.union` so the converter emits `anyOf`)
 * - No optional properties on LLM-emitted objects (OpenAI strict requires
 *   every property in `required`); optional fields belong on
 *   workflow-state shapes that never reach `generateObject`.
 *
 * `PartialBriefStateSchema` is the workflow-state schema and is never
 * passed to `generateObject`, so it keeps `.optional()` freely. Storage
 * schemas in other packages (drizzle-zod, route validators) follow their
 * own rules — the cross-provider constraints apply only here.
 */

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

export const MissingDocSchema = z
  .object({
    docType: z.string().describe("LaunchGood document type identifier."),
    reason: z.string().describe("Plain text reason. Max 500 characters."),
  })
  .strict();

export const ReviewerQuestionSchema = z
  .object({
    question: z.string(),
    suggestedAnswer: z.string().nullable(),
  })
  .strict();

/**
 * Single citation referencing a clause in `mizan-policy-corpus`.
 *
 * `relevance` is a Vectorize cosine-similarity score clamped to [0,1] at
 * the matchPolicy boundary (strict structured-output rejects min/max on
 * numbers, so the clamp lives in code, not in the schema).
 */
export const PolicyCitationSchema = z
  .object({
    clauseId: z.string(),
    source: z.enum(["zakat", "safety"]),
    excerpt: z.string(),
    relevance: z.number(),
  })
  .strict();

export type PolicyCitation = z.infer<typeof PolicyCitationSchema>;

/** Reviewer-facing drafted missing-evidence ask (Phase 4). */
export const DraftedOrganizerMessageSchema = z
  .object({
    message: z
      .string()
      .describe(
        "Polite missing-evidence ask. Plain text, max 2000 characters. Reference policy clauseIds where useful.",
      ),
    missing_items: z
      .array(z.string().describe("Doc type identifier; max 500 characters."))
      .describe("One entry per missing document the organizer must provide."),
  })
  .strict();

export type DraftedOrganizerMessage = z.infer<typeof DraftedOrganizerMessageSchema>;

/** Story coherence signal payload produced by `storyCoherence`. */
export const StoryCoherencePayloadSchema = z
  .object({
    named_entity_density: z
      .number()
      .describe(
        "Density of named entities (people, places, organizations) per 100 words. Caller clamps to [0,1].",
      ),
    template_match_score: z
      .number()
      .describe(
        "Similarity to common scam-pattern templates. Caller clamps to [0,1]; higher = closer match.",
      ),
    coherence_summary: z.string().describe("Plain text summary. Max 2000 characters."),
  })
  .strict();

export type StoryCoherencePayload = z.infer<typeof StoryCoherencePayloadSchema>;

/**
 * Reviewer brief payload — Phase 3 adds `policy_citations`; Phase 4 adds
 * `drafted_organizer_message` and `forced_escalate_reason` written by later
 * workflow steps.
 *
 * `composeBrief` emits a subset (without the two later-step fields and
 * with a dynamic `policy_citations` schema) via `buildPerCallBriefSchema`
 * in `steps/composeBrief/run.ts`; the full schema below is the canonical
 * storage shape used everywhere else.
 */
export const BriefPayloadSchema = z
  .object({
    recommendation: RecommendationEnum,
    verification_path: VerificationPathSchema,
    geography_tier: GeographyTierSchema,
    missing_docs: z.array(MissingDocSchema),
    reviewer_questions: z.array(ReviewerQuestionSchema),
    extracted_claims: z
      .string()
      .describe(
        "1-2 sentence plain-text summary of the verified claims supporting the recommendation.",
      ),
    confidence: z.number().describe("0-100 reviewer confidence integer."),
    policy_citations: PolicyCitationSchema.array().default([]),
    drafted_organizer_message: DraftedOrganizerMessageSchema.optional(),
    forced_escalate_reason: z.string().optional(),
  })
  .strict();

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

import { z } from "zod";

/**
 * Canonical persisted payload schemas — single source of truth for
 * `@mizan/db` JSON columns AND `@mizan/mastra` step boundaries.
 *
 * LLM-output schemas follow the cross-provider strict-mode common subset
 * (Anthropic + OpenAI 2026-04-30):
 *   - no minLength / maxLength keywords (use .describe() instead)
 *   - no propertyNames / non-false additionalProperties
 *   - no oneOf (use z.union so the converter emits anyOf)
 *   - no optional properties on LLM-emitted objects (OpenAI strict requires
 *     every property in `required`)
 *
 * Optional fields are reserved for shapes written by post-LLM workflow
 * steps (e.g. `drafted_organizer_message`, `forced_escalate_reason`); the
 * compose-time LLM never sees those optional slots — `composeBrief` omits
 * them from its per-call schema.
 */

export const RecommendationEnum = z.enum(["READY_FOR_REVIEW", "REQUEST_DOCS", "ESCALATE", "BLOCK"]);

export const VerificationPathSchema = z.enum([
  "documentary",
  "institutional_vouching",
  "community_vouching",
  "none",
]);

export const GeographyTierSchema = z.enum(["SAFE", "AT_RISK", "OFAC_ADJACENT", "OFAC"]);

export type Recommendation = z.infer<typeof RecommendationEnum>;
export type VerificationPath = z.infer<typeof VerificationPathSchema>;
export type GeographyTier = z.infer<typeof GeographyTierSchema>;
export type PolicySource = "zakat" | "safety";

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

/**
 * Reviewer brief payload — Phase 3 adds `policy_citations`; Phase 4 adds
 * `drafted_organizer_message`, `forced_escalate_reason`, and
 * `policy_grounded` written by later workflow steps.
 *
 * `composeBrief` emits a subset (without the later-step fields and with
 * a dynamic `policy_citations` schema) via `buildPerCallBriefSchema` in
 * `@mizan/mastra/steps/composeBrief/run.ts`; the full schema below is
 * the canonical storage shape used everywhere else.
 *
 * `policy_grounded` is `false` when `matchPolicy` returned zero clauses
 * — the brief was composed without policy citations and the reviewer
 * surface must flag it. Stitched onto the brief by `composeBrief` after
 * the LLM call (deterministic, not emitted by the model).
 */
export const BriefPayloadSchema = z
  .object({
    recommendation: RecommendationEnum,
    verification_path: VerificationPathSchema,
    geography_tier: GeographyTierSchema,
    policy_grounded: z
      .boolean()
      .describe(
        "True when composeBrief had at least one policy clause to ground on; false when matchPolicy returned zero results.",
      ),
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

export type MissingDoc = z.infer<typeof MissingDocSchema>;
export type ReviewerQuestion = z.infer<typeof ReviewerQuestionSchema>;
export type PolicyCitation = z.infer<typeof PolicyCitationSchema>;
export type DraftedOrganizerMessage = z.infer<typeof DraftedOrganizerMessageSchema>;
export type StoryCoherencePayload = z.infer<typeof StoryCoherencePayloadSchema>;
export type BriefPayload = z.infer<typeof BriefPayloadSchema>;

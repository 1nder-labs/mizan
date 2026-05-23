import { z } from "zod";
import {
  BriefPayloadSchema,
  GeographyTierSchema,
  PolicyCitationSchema,
  StoryCoherencePayloadSchema,
  VerificationPathSchema,
} from "@mizan/shared";
import { ExtractionsSchema } from "./extractions/index.ts";
import { VouchingChainSchema } from "./vouching.ts";
import { PhotoSignalPayloadSchema } from "./photo-signal.ts";

/*
 * `PartialBriefStateSchema` is the workflow-state schema and is never
 * passed to `generateObject`, so it keeps `.optional()` freely. Persisted
 * payload schemas live in `@mizan/shared/schemas/brief.ts` — re-exported
 * below for backwards-compatible import paths.
 */

export {
  BriefPayloadSchema,
  DraftedOrganizerMessageSchema,
  GeographyTierSchema,
  MissingDocSchema,
  PolicyCitationSchema,
  RecommendationEnum,
  ReviewerQuestionSchema,
  StoryCoherencePayloadSchema,
  VerificationPathSchema,
  type BriefPayload,
  type DraftedOrganizerMessage,
  type GeographyTier,
  type MissingDoc,
  type PolicyCitation,
  type PolicySource,
  type Recommendation,
  type ReviewerQuestion,
  type StoryCoherencePayload,
  type VerificationPath,
} from "@mizan/shared";

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

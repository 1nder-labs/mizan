import { z } from "zod";
import {
  BriefPayloadSchema,
  GeographyTierSchema,
  PhotoSignalPayloadSchema,
  PolicyCitationSchema,
  StoryCoherencePayloadSchema,
  VerificationPathSchema,
  VouchingChainVariantSchema,
} from "@mizan/shared";
import { ExtractionsSchema } from "./extractions/index.ts";

/**
 * Workflow-state schema — what each Mastra step sees as its input and
 * emits as its output. Strictly internal to the mastra workflow; never
 * persisted, never passed to `generateObject`. Persisted-payload schemas
 * live in `@mizan/shared` (single source of truth) and are referenced
 * here for the nested shape definitions.
 */
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
      vouching: VouchingChainVariantSchema.optional(),
    })
    .optional(),
  brief: BriefPayloadSchema.optional(),
});

export type PartialBriefState = z.infer<typeof PartialBriefStateSchema>;

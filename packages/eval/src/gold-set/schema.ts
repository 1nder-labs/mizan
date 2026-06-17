import { GeographyTierSchema, RecommendationEnum } from "@mizan/shared";
import { z } from "zod";

/**
 * A curated gold-set fixture pairing a workflow input (case seed) with
 * expected brief outcomes. The `caseSeedId` must reference an existing
 * seed case under `packages/mastra/src/seeds/cases/<case>/seed.json`.
 *
 * Recommendation expectation is mutually exclusive:
 * - `expected_recommendation` — strict equality (deterministic cases,
 *   e.g. `forceEscalate`-gated non-SAFE geography).
 * - `expected_recommendation_in` — allowed-set membership (LLM-judged
 *   cases where the recommendation is non-deterministic).
 */
export const GoldCaseSchema = z
  .object({
    caseSeedId: z.string().min(1),
    label: z.string().min(1),
    expected_geography_tier: GeographyTierSchema,
    expect_policy_grounded: z.boolean(),
    expected_recommendation: RecommendationEnum.optional(),
    expected_recommendation_in: RecommendationEnum.array().optional(),
  })
  .refine(
    (val) =>
      (val.expected_recommendation !== undefined) !==
      (val.expected_recommendation_in !== undefined),
    {
      message: "Exactly one of expected_recommendation or expected_recommendation_in must be set",
    },
  );

export type GoldCase = z.infer<typeof GoldCaseSchema>;

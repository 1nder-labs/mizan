import { z } from "zod";

/**
 * Shapes for the deterministic stub-tool outputs. The Phase 4 stubs in
 * `@mizan/mastra/tools/*` produce values matching these schemas; the
 * Phase 10 real-vendor swap will return the same shapes from the live
 * reverse-image and AI-detection providers.
 *
 * Persisted via `PhotoSignalPayloadSchema` into `signals.payload_json`,
 * so the schema definitions live in `@mizan/shared` to keep the
 * `@mizan/db` package free of any type-level dependency on
 * `@mizan/mastra`.
 */

export const AiGenProbabilitySchema = z.enum(["low", "medium", "high", "very_high"]);

export const AiGenResultSchema = z
  .object({
    probability: AiGenProbabilitySchema,
    model: z.string(),
  })
  .strict();

export const ReverseImageHitSchema = z
  .object({
    url: z.string(),
    /*
     * `.finite()` rejects NaN and ±Infinity at parse time so a malformed
     * stub or vendor response cannot smuggle non-comparable values into
     * downstream confidence-threshold checks. Strict-mode providers emit
     * `{ type: "number" }` for `.finite()` — no extra JSON Schema
     * keywords, so cross-provider compatibility is preserved.
     */
    confidence: z.number().finite(),
  })
  .strict();

export const ReverseImageResultSchema = z
  .object({
    hits: ReverseImageHitSchema.array(),
    checked_at: z.string(),
  })
  .strict();

export type AiGenProbability = z.infer<typeof AiGenProbabilitySchema>;
export type AiGenResult = z.infer<typeof AiGenResultSchema>;
export type ReverseImageHit = z.infer<typeof ReverseImageHitSchema>;
export type ReverseImageResult = z.infer<typeof ReverseImageResultSchema>;

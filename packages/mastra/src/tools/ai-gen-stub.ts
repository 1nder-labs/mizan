import { z } from "zod";
import { deterministicUnitFloat } from "./deterministic-hash.ts";

export const AiGenProbabilitySchema = z.enum(["low", "medium", "high", "very_high"]);

export const AiGenResultSchema = z.object({
  probability: AiGenProbabilitySchema,
  model: z.literal("stub-v1"),
});

export type AiGenResult = z.infer<typeof AiGenResultSchema>;

function bucketProbability(unit: number): z.infer<typeof AiGenProbabilitySchema> {
  if (unit < 0.25) return "low";
  if (unit < 0.5) return "medium";
  if (unit < 0.75) return "high";
  return "very_high";
}

/**
 * Deterministic AI-generation stub keyed by `r2_key` + `salt`.
 *
 * Production stub per PRD §6 Phase 4 — real AI detector swap happens in
 * Phase 10. The salt prevents an attacker who controls the r2_key naming
 * from brute-forcing a clean signal.
 */
export async function aiGenStub(input: { r2_key: string; salt: string }): Promise<AiGenResult> {
  const unit = await deterministicUnitFloat(`${input.salt}:${input.r2_key}`);
  return {
    probability: bucketProbability(unit),
    model: "stub-v1",
  };
}

import { z } from "zod";

export const AiGenProbabilitySchema = z.enum(["low", "medium", "high", "very_high"]);

export const AiGenResultSchema = z.object({
  probability: AiGenProbabilitySchema,
  model: z.literal("mock-v1"),
});

export type AiGenResult = z.infer<typeof AiGenResultSchema>;

/** Deterministic float in [0, 1] from SHA-256 of the R2 object key. */
async function deterministicUnitFloat(key: string): Promise<number> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const bytes = new Uint8Array(digest).slice(0, 8);
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  const max = 2n ** 64n - 1n;
  return Number(value) / Number(max);
}

function bucketProbability(unit: number): z.infer<typeof AiGenProbabilitySchema> {
  if (unit < 0.25) return "low";
  if (unit < 0.5) return "medium";
  if (unit < 0.75) return "high";
  return "very_high";
}

/** Deterministic AI-generation mock keyed by `r2_key`. */
export async function mockAiGenDetection(input: { r2_key: string }): Promise<AiGenResult> {
  const unit = await deterministicUnitFloat(input.r2_key);
  return {
    probability: bucketProbability(unit),
    model: "mock-v1",
  };
}

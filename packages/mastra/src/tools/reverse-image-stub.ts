import { z } from "zod";
import { deterministicUnitFloat } from "./deterministic-hash.ts";

export const ReverseImageHitSchema = z.object({
  url: z.string(),
  confidence: z.number(),
});

export const ReverseImageResultSchema = z.object({
  hits: ReverseImageHitSchema.array(),
  checked_at: z.string(),
});

export type ReverseImageResult = z.infer<typeof ReverseImageResultSchema>;

/**
 * Deterministic reverse-image stub keyed by `r2_key` + `salt`.
 *
 * Production stub per PRD §6 Phase 4 — real reverse-image search swap
 * happens in Phase 10. `checked_at` varies per call; `hits` are stable
 * for the same (key, salt) pair. The salt prevents an attacker who
 * controls the r2_key naming from brute-forcing a clean signal.
 */
export async function reverseImageStub(input: {
  r2_key: string;
  salt: string;
}): Promise<ReverseImageResult> {
  const unit = await deterministicUnitFloat(`${input.salt}:${input.r2_key}`);
  const hitCount = Math.floor(unit * 4);
  const hits = Array.from({ length: hitCount }, (_, index) => {
    const confidence = Math.min(1, Math.max(0, unit * (index + 1) * 0.33));
    return {
      url: `https://stub-images.example/${input.r2_key}/${String(index)}`,
      confidence,
    };
  });
  return {
    hits,
    checked_at: new Date().toISOString(),
  };
}

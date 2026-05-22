import { z } from "zod";

export const ReverseImageHitSchema = z.object({
  url: z.string(),
  confidence: z.number(),
});

export const ReverseImageResultSchema = z.object({
  hits: ReverseImageHitSchema.array(),
  checked_at: z.string(),
});

export type ReverseImageResult = z.infer<typeof ReverseImageResultSchema>;

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

/**
 * Deterministic reverse-image mock keyed by `r2_key`.
 * `checked_at` varies per call; `hits` are stable for the same key.
 */
export async function mockReverseImageSearch(input: {
  r2_key: string;
}): Promise<ReverseImageResult> {
  const unit = await deterministicUnitFloat(input.r2_key);
  const hitCount = Math.floor(unit * 4);
  const hits = Array.from({ length: hitCount }, (_, index) => {
    const confidence = Math.min(1, Math.max(0, unit * (index + 1) * 0.33));
    return {
      url: `https://mock-images.example/${input.r2_key}/${String(index)}`,
      confidence,
    };
  });
  return {
    hits,
    checked_at: new Date().toISOString(),
  };
}

/**
 * Deterministic float in [0, 1] from SHA-256 of an input key.
 * Shared by `ai-gen-stub.ts` and `reverse-image-stub.ts` so both produce
 * stable outputs for the same key without re-hashing twice.
 */
export async function deterministicUnitFloat(key: string): Promise<number> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const bytes = new Uint8Array(digest).slice(0, 8);
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  const max = 2n ** 64n - 1n;
  return Number(value) / Number(max);
}

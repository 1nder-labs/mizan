import { existsSync } from "node:fs";
import { z } from "zod";

/**
 * Real-image fixture dimensions. Vision LLMs (OpenAI, Anthropic)
 * reject the 1×1 PNG that earlier seed builds shipped — the workflow
 * needs a parseable photo for the extractor to call at all. We fetch
 * from `picsum.photos` on demand and cache to disk; subsequent seed
 * runs reuse the cached file so the network round-trip happens once.
 */
const FIXTURE_WIDTH = 600;
const FIXTURE_HEIGHT = 400;
const FIXTURE_SOURCE = `https://picsum.photos/${FIXTURE_WIDTH}/${FIXTURE_HEIGHT}`;

export const DOCUMENTARY_SEED_FILES = [
  "case-001.json",
  "case-002.json",
  "case-003.json",
  "case-004.json",
  "case-005.json",
] as const;

export const COMMUNITY_VOUCHING_SEED_FILES = [
  "case-006.json",
  "case-007.json",
  "case-008.json",
] as const;

export const SEED_CASE_FILES = [
  ...DOCUMENTARY_SEED_FILES,
  ...COMMUNITY_VOUCHING_SEED_FILES,
] as const;

export function documentarySeedJsonPath(filename: string): string {
  return new URL(`../packages/mastra/src/seeds/documentary/${filename}`, import.meta.url).pathname;
}

export function communitySeedJsonPath(filename: string): string {
  return new URL(`../packages/mastra/src/seeds/community-vouching/${filename}`, import.meta.url)
    .pathname;
}

const COMMUNITY_VOUCHING_LOOKUP: ReadonlySet<string> = new Set(COMMUNITY_VOUCHING_SEED_FILES);

export function seedJsonPath(filename: string): string {
  if (COMMUNITY_VOUCHING_LOOKUP.has(filename)) {
    return communitySeedJsonPath(filename);
  }
  return documentarySeedJsonPath(filename);
}

export function fixturePath(filename: string): string {
  return new URL(`../packages/mastra/src/seeds/docs/fixtures/${filename}`, import.meta.url)
    .pathname;
}

const SeedR2KeysSchema = z.object({
  r2_keys: z.object({
    creator_id: z.string(),
    bank_statement: z.string(),
    category_doc: z.string(),
  }),
});

/** All R2 fixture keys referenced by documentary + community-vouching seed cases. */
export async function allFixtureKeys(): Promise<string[]> {
  const keys = new Set<string>();
  for (const filename of SEED_CASE_FILES) {
    const text = await Bun.file(seedJsonPath(filename)).text();
    const seed = SeedR2KeysSchema.parse(JSON.parse(text));
    keys.add(seed.r2_keys.creator_id);
    keys.add(seed.r2_keys.bank_statement);
    keys.add(seed.r2_keys.category_doc);
  }
  return [...keys];
}

/**
 * Materialises real-image fixtures for every seed key. Files missing
 * on disk are fetched fresh from `picsum.photos`; cached files are
 * left in place so re-runs don't churn the network or change the
 * bytes the workflow sees. R2 keys carry a `.png` extension by
 * convention; the bytes are typically JPEG (picsum), which
 * `toImagePart` sniffs from magic bytes at the LLM boundary — the
 * extension on the key is irrelevant.
 */
export async function materializeLocalFixtures(): Promise<void> {
  const keys = await allFixtureKeys();
  for (const key of keys) {
    const target = fixturePath(key);
    if (existsSync(target)) continue;
    const res = await fetch(FIXTURE_SOURCE, { redirect: "follow" });
    if (!res.ok) {
      throw new Error(`fixture fetch failed (${res.status}) for ${key}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    await Bun.write(target, bytes);
  }
}

import { z } from "zod";

/** 1×1 PNG used for synthetic anonymized document fixtures. */
export const MINIMAL_PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);

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

/** Writes minimal PNG bytes for every seed fixture key under docs/fixtures/. */
export async function materializeLocalFixtures(): Promise<void> {
  const keys = await allFixtureKeys();
  for (const key of keys) {
    await Bun.write(fixturePath(key), MINIMAL_PNG_BYTES);
  }
}

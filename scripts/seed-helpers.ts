import { existsSync } from "node:fs";
import { z } from "zod";

/**
 * Seed-case layout: every case is a self-contained folder under
 * `packages/mastra/src/seeds/cases/<case>/` holding its `seed.json` plus the
 * rendered document PDFs. R2 keys are `<case>/<doc>.pdf`. The committed PDFs are
 * the source of truth — there is no on-demand fetch; a missing fixture is a
 * hard error so a broken seed surfaces immediately.
 */
export const SEED_CASE_FILES = [
  "case-001",
  "case-002",
  "case-003",
  "case-004",
  "case-005",
  "case-006",
  "case-007",
  "case-008",
] as const;

const CASES_ROOT = new URL("../packages/mastra/src/seeds/cases/", import.meta.url).pathname;

/** Absolute path to a case's `seed.json`. */
export function seedJsonPath(caseName: string): string {
  return `${CASES_ROOT}${caseName}/seed.json`;
}

/** Absolute path to a fixture identified by its R2 key (`<case>/<doc>.pdf`). */
export function fixturePath(r2Key: string): string {
  return `${CASES_ROOT}${r2Key}`;
}

const SeedR2KeysSchema = z.object({
  r2_keys: z.object({
    creator_id: z.string(),
    bank_statement: z.string(),
    category_doc: z.string(),
  }),
});

/** All R2 fixture keys referenced by the seeded cases. */
export async function allFixtureKeys(): Promise<string[]> {
  const keys = new Set<string>();
  for (const caseName of SEED_CASE_FILES) {
    const text = await Bun.file(seedJsonPath(caseName)).text();
    const { r2_keys } = SeedR2KeysSchema.parse(JSON.parse(text));
    keys.add(r2_keys.creator_id);
    keys.add(r2_keys.bank_statement);
    keys.add(r2_keys.category_doc);
  }
  return [...keys];
}

/**
 * Verifies every seeded case's fixture PDFs exist on disk. The PDFs are
 * committed alongside their seed, so this is a fail-fast guard rather than a
 * generator — a missing file means the case folder is incomplete.
 */
export async function materializeLocalFixtures(): Promise<void> {
  const keys = await allFixtureKeys();
  for (const key of keys) {
    if (!existsSync(fixturePath(key))) {
      throw new Error(`seed fixture missing for key ${key} — expected at cases/${key}`);
    }
  }
}

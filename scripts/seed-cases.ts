#!/usr/bin/env bun
/**
 * Seeds five documentary cases into local D1 via wrangler.
 * Idempotent: ON CONFLICT (id) DO NOTHING.
 *
 * Requires admin user from `bun run db:seed` and applied migrations.
 */

import { CaseOverlaySchema } from "@mizan/mastra";
import { z } from "zod";
import { SEED_CASE_FILES, seedJsonPath } from "./seed-helpers.ts";

const SeedFileSchema = z.object({
  id: z.string(),
  status: z.string(),
  category: z.string(),
  geography: z.string(),
  claimed_zakat_category: z.string(),
  organizer_name: z.string(),
  story: z.string(),
  vouching_narrative: z.string().optional(),
  r2_keys: z.object({
    creator_id: z.string(),
    bank_statement: z.string(),
    category_doc: z.string(),
  }),
});

const AdminLookupSchema = z.array(z.object({ results: z.array(z.object({ id: z.string() })) }));

async function fetchAdminUserId(): Promise<string> {
  const proc = Bun.spawn(
    [
      "bunx",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      "SELECT id FROM users WHERE email = 'admin@mizan.test' LIMIT 1",
      "--json",
    ],
    { cwd: "apps/worker", stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`admin lookup failed (exit ${exitCode}): ${err}`);
  }
  const raw = await new Response(proc.stdout).text();
  const parsed = AdminLookupSchema.parse(JSON.parse(raw));
  const row = parsed[0]?.results[0];
  if (!row?.id) {
    throw new Error("admin@mizan.test not found — run bun run db:seed first");
  }
  return row.id;
}

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

async function seedCase(seed: z.infer<typeof SeedFileSchema>, adminId: string): Promise<void> {
  const overlay = CaseOverlaySchema.parse({
    story: seed.story,
    organizer_name: seed.organizer_name,
    r2_keys: seed.r2_keys,
    ...(seed.vouching_narrative ? { vouching_narrative: seed.vouching_narrative } : {}),
  });
  const overlayJson = sqlEscape(JSON.stringify(overlay));
  const sql = `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, created_at, updated_at)
VALUES ('${seed.id}', '${seed.status}', '${seed.category}', '${seed.geography}', '${seed.claimed_zakat_category}', '${overlayJson}', '${adminId}', ${Date.now()}, ${Date.now()})
ON CONFLICT(id) DO NOTHING;`;
  const proc = Bun.spawn(["bunx", "wrangler", "d1", "execute", "DB", "--local", "--command", sql], {
    cwd: "apps/worker",
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`seed failed for ${seed.id} (exit ${exitCode}): ${err}`);
  }
  console.log(`seeded ${seed.id} (${seed.category}/${seed.geography})`);
}

const adminId = await fetchAdminUserId();

for (const filename of SEED_CASE_FILES) {
  const text = await Bun.file(seedJsonPath(filename)).text();
  const seed = SeedFileSchema.parse(JSON.parse(text));
  await seedCase(seed, adminId);
}

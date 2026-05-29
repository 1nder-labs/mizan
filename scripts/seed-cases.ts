#!/usr/bin/env bun
/**
 * Seeds five documentary cases into local D1 via wrangler.
 * Idempotent: ON CONFLICT (id) DO NOTHING.
 */

import { CaseOverlaySchema, SeedCaseSchema, type SeedCase } from "@mizan/shared";
import { z } from "zod";
import { SEED_CASE_FILES, seedJsonPath } from "./seed-helpers.ts";

const LookupSchema = z.array(
  z.object({
    results: z.array(z.object({ id: z.string(), organization_id: z.string() })),
  }),
);

async function fetchAdminContext(): Promise<{ userId: string; organizationId: string }> {
  const proc = Bun.spawn(
    [
      "bunx",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      `SELECT u.id, m.organization_id FROM users u JOIN member m ON m.user_id = u.id WHERE u.email = 'admin@mizan.test' AND m.role = 'admin' LIMIT 1`,
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
  const parsed = LookupSchema.parse(JSON.parse(raw));
  const row = parsed[0]?.results[0];
  if (!row?.id || !row.organization_id) {
    throw new Error("admin@mizan.test not found — run bun run db:seed first");
  }
  return { userId: row.id, organizationId: row.organization_id };
}

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

async function seedCase(seed: SeedCase, adminId: string, organizationId: string): Promise<void> {
  const overlay = CaseOverlaySchema.parse({
    story: seed.story,
    organizer_name: seed.organizer_name,
    r2_keys: seed.r2_keys,
    ...(seed.vouching_narrative ? { vouching_narrative: seed.vouching_narrative } : {}),
  });
  const overlayJson = sqlEscape(JSON.stringify(overlay));
  const sql = `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
VALUES ('${seed.id}', '${seed.status}', '${seed.category}', '${seed.geography}', '${seed.claimed_zakat_category}', '${overlayJson}', '${adminId}', '${organizationId}', ${Date.now()}, ${Date.now()})
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

const admin = await fetchAdminContext();

for (const filename of SEED_CASE_FILES) {
  const text = await Bun.file(seedJsonPath(filename)).text();
  const seed = SeedCaseSchema.parse(JSON.parse(text));
  await seedCase(seed, admin.userId, admin.organizationId);
}

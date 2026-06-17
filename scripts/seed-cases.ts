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
      `SELECT u.id, m.organization_id FROM users u JOIN members m ON m.user_id = u.id WHERE u.email = 'admin@mizan.test' AND m.role = 'admin' LIMIT 1`,
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

const SEED_DOC_KINDS = ["creator_id", "bank_statement", "category_doc"] as const;

/** Deterministic `documents` rows pointing at the seed's fixture R2 keys (idempotent). */
function documentInserts(seed: SeedCase, organizationId: string, ts: number): string {
  return SEED_DOC_KINDS.map((kind) => {
    const id = `${seed.id}-${kind}`;
    const key = sqlEscape(seed.r2_keys[kind]);
    return `INSERT INTO documents (id, case_id, doc_kind, r2_key, filename, content_type, uploaded_at, organization_id)
VALUES ('${id}', '${seed.id}', '${kind}', '${key}', '', 'application/pdf', ${ts}, '${organizationId}') ON CONFLICT(id) DO NOTHING;`;
  }).join("\n");
}

async function seedCase(seed: SeedCase, adminId: string, organizationId: string): Promise<void> {
  const overlay = CaseOverlaySchema.parse({
    story: seed.story,
    organizer_name: seed.organizer_name,
    ...(seed.vouching_narrative ? { vouching_narrative: seed.vouching_narrative } : {}),
  });
  const overlayJson = sqlEscape(JSON.stringify(overlay));
  const ts = Date.now();
  const sql = `INSERT INTO cases (id, status, title, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
VALUES ('${seed.id}', '${seed.status}', '${sqlEscape(seed.title)}', '${seed.category}', '${seed.geography}', '${seed.claimed_zakat_category}', '${overlayJson}', '${adminId}', '${organizationId}', ${ts}, ${ts})
ON CONFLICT(id) DO NOTHING;
${documentInserts(seed, organizationId, ts)}`;
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

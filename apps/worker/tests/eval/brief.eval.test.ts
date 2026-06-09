/**
 * Eval test: runs each gold-set case through the real brief workflow
 * and asserts outcomes per the assertion model (strict on deterministic
 * fields, tolerant on LLM-judged recommendation).
 *
 * Gated on three conditions:
 *   1. RUN_REMOTE_INTEGRATION=1 (remote Vectorize binding)
 *   2. RUN_EVAL=1 (selects this eval suite)
 *   3. A live provider key present (OPENAI_API_KEY)
 *
 * Invocation:
 *   RUN_REMOTE_INTEGRATION=1 RUN_EVAL=1 OPENAI_API_KEY=<key> \
 *     bun --filter @mizan/worker test:integration
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BriefPayloadSchema, type BriefPayload } from "@mizan/shared";
import { loadGoldSet, type GoldCase } from "@mizan/eval";
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";
import { RUN_EVAL, RUN_REMOTE_VECTORIZE } from "../integration/remote-deps.ts";
import { seedDocuments } from "../integration/cases-test-helpers.ts";
import seedCase001 from "../../../../packages/mastra/src/seeds/documentary/case-001.json" with { type: "json" };
import seedCase002 from "../../../../packages/mastra/src/seeds/documentary/case-002.json" with { type: "json" };
import seedCase003 from "../../../../packages/mastra/src/seeds/documentary/case-003.json" with { type: "json" };
import seedCase004 from "../../../../packages/mastra/src/seeds/documentary/case-004.json" with { type: "json" };
import seedCase005 from "../../../../packages/mastra/src/seeds/documentary/case-005.json" with { type: "json" };
import seedCase009 from "../../../../packages/mastra/src/seeds/documentary/case-009.json" with { type: "json" };

const BASE = "http://localhost";

interface SeedJson {
  readonly id: string;
  readonly status: string;
  readonly category: string;
  readonly geography: string;
  readonly claimed_zakat_category: string;
  readonly organizer_name: string;
  readonly story: string;
  readonly r2_keys: {
    readonly creator_id: string;
    readonly bank_statement: string;
    readonly category_doc: string;
  };
}

const SEED_BY_ID: Record<string, SeedJson> = {
  [seedCase001.id]: seedCase001 as SeedJson,
  [seedCase002.id]: seedCase002 as SeedJson,
  [seedCase003.id]: seedCase003 as SeedJson,
  [seedCase004.id]: seedCase004 as SeedJson,
  [seedCase005.id]: seedCase005 as SeedJson,
  [seedCase009.id]: seedCase009 as SeedJson,
};

const hasProviderKey = !!process.env["OPENAI_API_KEY"] || !!process.env["ANTHROPIC_API_KEY"];

function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

async function seedAdmin(): Promise<{
  cookie: string;
  userId: string;
  organizationId: string;
}> {
  const email = `eval-admin-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Eval Admin" }),
    }),
  );
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row?.id) throw new Error("eval admin seed failed");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("eval admin org seed failed");
  return {
    cookie: cookiesFrom(signIn),
    userId: row.id,
    organizationId: memberRow.organization_id,
  };
}

async function seedCase(
  adminUserId: string,
  organizationId: string,
  seed: SeedJson,
): Promise<void> {
  const overlay = {
    story: seed.story,
    organizer_name: seed.organizer_name,
  };
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       brief_partial_json = excluded.brief_partial_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      seed.id,
      "DRAFT",
      seed.category,
      seed.geography,
      seed.claimed_zakat_category,
      JSON.stringify(overlay),
      adminUserId,
      organizationId,
      Date.now(),
      Date.now(),
    )
    .run();

  await env.R2_BUCKET.put(seed.r2_keys.creator_id, MINIMAL_PNG_BYTES);
  await env.R2_BUCKET.put(seed.r2_keys.bank_statement, MINIMAL_PNG_BYTES);
  await env.R2_BUCKET.put(seed.r2_keys.category_doc, MINIMAL_PNG_BYTES);
  await seedDocuments({ caseId: seed.id, organizationId, keys: seed.r2_keys });
}

async function drainSse(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

describe.skipIf(!RUN_EVAL || !RUN_REMOTE_VECTORIZE || !hasProviderKey)("brief.eval", () => {
  let adminCookie = "";
  let adminUserId = "";
  let adminOrgId = "";
  let goldCases: GoldCase[];

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await seedAdmin();
    adminCookie = admin.cookie;
    adminUserId = admin.userId;
    adminOrgId = admin.organizationId;
    goldCases = loadGoldSet();
    for (const gc of goldCases) {
      const seed = SEED_BY_ID[gc.caseSeedId];
      if (!seed) throw new Error(`no seed data for caseSeedId ${gc.caseSeedId}`);
      await seedCase(adminUserId, adminOrgId, seed);
    }
  }, 120_000);

  for (const gc of goldCases ?? []) {
    it(`${gc.label}`, async () => {
      const res = await exports.default.fetch(
        new Request(`${BASE}/api/cases/${gc.caseSeedId}/brief`, {
          method: "POST",
          headers: {
            Cookie: adminCookie,
            Accept: "text/event-stream",
            "Idempotency-Key": crypto.randomUUID(),
          },
        }),
      );
      expect(res.status).toBe(200);
      await drainSse(res);

      const briefRow = await env.DB.prepare("SELECT payload_json FROM briefs WHERE case_id = ?")
        .bind(gc.caseSeedId)
        .first<{ payload_json: string }>();
      expect(briefRow).toBeTruthy();

      const brief: BriefPayload = BriefPayloadSchema.parse(
        JSON.parse(briefRow?.payload_json ?? "{}"),
      );

      if (process.env["EVAL_PRINT_MODE"]) {
        console.log(
          gc.caseSeedId,
          brief.recommendation,
          brief.geography_tier,
          brief.policy_grounded,
        );
        return;
      }

      expect(brief.geography_tier).toBe(gc.expected_geography_tier);
      expect(brief.policy_grounded).toBe(gc.expect_policy_grounded);

      if (gc.expected_recommendation) {
        expect(brief.recommendation).toBe(gc.expected_recommendation);
      } else {
        expect(gc.expected_recommendation_in).toContain(brief.recommendation);
      }

      await env.DB.prepare("UPDATE cases SET status = 'DRAFT', current_run_id = NULL WHERE id = ?")
        .bind(gc.caseSeedId)
        .run();
    }, 120_000);
  }
});

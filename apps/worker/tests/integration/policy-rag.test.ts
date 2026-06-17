/**
 * Integration test: policy RAG end-to-end with seeded Miniflare Vectorize.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { allCorpusClauseIds } from "@mizan/mastra";
import { BriefPayloadSchema } from "@mizan/shared";
import {
  responsesForCaseIndex,
  SEED_CASE_IDS,
  serializeMockResponses,
} from "@mizan/mastra/testing";
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";
import { embedCorpusInto } from "../../../../scripts/lib/embed-corpus-into.ts";
import { RUN_REMOTE_VECTORIZE } from "./remote-deps.ts";
import { seedDocuments } from "./cases-test-helpers.ts";
import seedCase001Raw from "../../../../packages/mastra/src/seeds/cases/case-001/seed.json" with { type: "json" };

const BASE = "http://localhost";
const CASE_ID = SEED_CASE_IDS[0];

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

function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

async function seedAdmin(): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `policy-rag-admin-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Policy RAG Admin" }),
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
  if (!row?.id) throw new Error("policy-rag admin seed failed");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("policy-rag admin org seed failed");
  return { cookie: cookiesFrom(signIn), userId: row.id, organizationId: memberRow.organization_id };
}

async function seedCase001(adminUserId: string, organizationId: string): Promise<void> {
  const seed = seedCase001Raw as SeedJson;
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
     VALUES (?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET brief_partial_json = excluded.brief_partial_json, updated_at = excluded.updated_at`,
  )
    .bind(
      seed.id,
      seed.category,
      seed.geography,
      seed.claimed_zakat_category,
      JSON.stringify({
        story: seed.story,
        organizer_name: seed.organizer_name,
      }),
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

const describeWithKey = RUN_REMOTE_VECTORIZE ? describe : describe.skip;

describeWithKey("policy rag integration", () => {
  let adminCookie = "";
  let adminUserId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await seedAdmin();
    adminCookie = admin.cookie;
    adminUserId = admin.userId;
    await seedCase001(adminUserId, admin.organizationId);
    env.MOCK_LLM_RESPONSES = serializeMockResponses(responsesForCaseIndex(0));
    await embedCorpusInto(
      env.VECTORIZE,
      {},
      env.OPENAI_API_KEY ? { OPENAI_API_KEY: env.OPENAI_API_KEY } : {},
    );
  }, 120_000);

  it("case-001 brief includes at least two corpus-backed policy citations", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_ID}/brief`, {
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

    const row = await env.DB.prepare("SELECT payload_json FROM briefs WHERE case_id = ?")
      .bind(CASE_ID)
      .first<{ payload_json: string }>();
    if (!row?.payload_json) throw new Error("brief not persisted");
    const brief = BriefPayloadSchema.parse(JSON.parse(row.payload_json));
    expect(brief.policy_citations.length).toBeGreaterThanOrEqual(2);
    const corpusIds = allCorpusClauseIds();
    for (const citation of brief.policy_citations) {
      expect(corpusIds.has(citation.clauseId)).toBe(true);
    }
  }, 60_000);
});

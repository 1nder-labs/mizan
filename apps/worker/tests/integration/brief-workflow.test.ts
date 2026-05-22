/**
 * Integration test: brief workflow end-to-end via mock LLM + SSE route.
 */

import { readFileSync } from "node:fs";
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import {
  responsesForCaseIndex,
  SEED_CASE_IDS,
  serializeMockResponses,
} from "@mizan/mastra/testing";
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";

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

const SEED_FILES = [
  "case-001.json",
  "case-002.json",
  "case-003.json",
  "case-004.json",
  "case-005.json",
] as const;

function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

async function seedAdmin(): Promise<string> {
  const email = `brief-admin-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Brief Admin" }),
    }),
  );
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE email = ?").bind(email).run();
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
  if (!row?.id) throw new Error("admin seed failed");
  return cookiesFrom(signIn);
}

async function loadSeed(filename: string): Promise<SeedJson> {
  const path = new URL(
    `../../../../packages/mastra/src/seeds/documentary/${filename}`,
    import.meta.url,
  ).pathname;
  return JSON.parse(readFileSync(path, "utf8")) as SeedJson;
}

async function seedCases(adminUserId: string): Promise<void> {
  for (const filename of SEED_FILES) {
    const seed = await loadSeed(filename);
    const overlay = {
      story: seed.story,
      organizer_name: seed.organizer_name,
      r2_keys: seed.r2_keys,
    };
    await env.DB.prepare(
      `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        Date.now(),
        Date.now(),
      )
      .run();

    await env.R2_BUCKET.put(seed.r2_keys.creator_id, MINIMAL_PNG_BYTES);
    await env.R2_BUCKET.put(seed.r2_keys.bank_statement, MINIMAL_PNG_BYTES);
    await env.R2_BUCKET.put(seed.r2_keys.category_doc, MINIMAL_PNG_BYTES);
  }
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

describe("brief workflow integration", () => {
  let adminCookie = "";
  let adminUserId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    adminCookie = await seedAdmin();
    const row = await env.DB.prepare(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at DESC LIMIT 1",
    ).first<{ id: string }>();
    if (!row?.id) throw new Error("admin user missing");
    adminUserId = row.id;
    await seedCases(adminUserId);
  }, 60_000);

  it.each(SEED_CASE_IDS.map((id, index) => [id, index] as const))(
    "case %s completes workflow and persists brief",
    async (caseId, index) => {
      env.MOCK_LLM_RESPONSES = serializeMockResponses(responsesForCaseIndex(index));
      const res = await exports.default.fetch(
        new Request(`${BASE}/api/cases/${caseId}/brief`, {
          method: "POST",
          headers: {
            Cookie: adminCookie,
            Accept: "text/event-stream",
            "Idempotency-Key": crypto.randomUUID(),
          },
        }),
      );
      expect(res.status).toBe(200);
      const sse = await drainSse(res);
      expect(sse.length).toBeGreaterThan(0);

      const briefRow = await env.DB.prepare("SELECT id FROM briefs WHERE case_id = ?")
        .bind(caseId)
        .first();
      expect(briefRow).toBeTruthy();

      const caseRow = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
        .bind(caseId)
        .first<{ status: string }>();
      expect(caseRow?.status).toBe("READY_FOR_REVIEW");

      await env.DB.prepare("UPDATE cases SET status = 'DRAFT', current_run_id = NULL WHERE id = ?")
        .bind(caseId)
        .run();
    },
    60_000,
  );

  it("returns 401 without session", async () => {
    const caseId = SEED_CASE_IDS[0];
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief`, {
        method: "POST",
        headers: { Accept: "text/event-stream", "Idempotency-Key": crypto.randomUUID() },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown case id", async () => {
    const unknownId = crypto.randomUUID();
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${unknownId}/brief`, {
        method: "POST",
        headers: {
          Cookie: adminCookie,
          Accept: "text/event-stream",
          "Idempotency-Key": crypto.randomUUID(),
        },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 on producer-guard race", async () => {
    const caseId = crypto.randomUUID();
    const seed = await loadSeed("case-001.json");
    await env.DB.prepare(
      `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, created_at, updated_at)
       VALUES (?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        caseId,
        seed.category,
        seed.geography,
        seed.claimed_zakat_category,
        JSON.stringify({
          story: seed.story,
          organizer_name: seed.organizer_name,
          r2_keys: seed.r2_keys,
        }),
        adminUserId,
        Date.now(),
        Date.now(),
      )
      .run();

    env.MOCK_LLM_RESPONSES = serializeMockResponses(responsesForCaseIndex(0));
    const headers = {
      Cookie: adminCookie,
      Accept: "text/event-stream",
      "Idempotency-Key": crypto.randomUUID(),
    };
    const [first, second] = await Promise.all([
      exports.default.fetch(
        new Request(`${BASE}/api/cases/${caseId}/brief`, { method: "POST", headers }),
        {
          signal: AbortSignal.timeout(30_000),
        },
      ),
      exports.default.fetch(
        new Request(`${BASE}/api/cases/${caseId}/brief`, { method: "POST", headers }),
        {
          signal: AbortSignal.timeout(30_000),
        },
      ),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  }, 60_000);
});

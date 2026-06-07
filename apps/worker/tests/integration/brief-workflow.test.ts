/**
 * Integration test: brief workflow end-to-end via mock LLM + SSE route.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BriefPayloadSchema } from "@mizan/shared";
import {
  responsesForCaseIndex,
  SEED_CASE_IDS,
  serializeMockResponses,
} from "@mizan/mastra/testing";
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";
import { RUN_REMOTE_VECTORIZE } from "./remote-deps.ts";
import { seedDocuments } from "./cases-test-helpers.ts";
import seedCase001 from "../../../../packages/mastra/src/seeds/documentary/case-001.json" with { type: "json" };
import seedCase002 from "../../../../packages/mastra/src/seeds/documentary/case-002.json" with { type: "json" };
import seedCase003 from "../../../../packages/mastra/src/seeds/documentary/case-003.json" with { type: "json" };
import seedCase004 from "../../../../packages/mastra/src/seeds/documentary/case-004.json" with { type: "json" };
import seedCase005 from "../../../../packages/mastra/src/seeds/documentary/case-005.json" with { type: "json" };

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

const SEED_DATA: readonly SeedJson[] = [
  seedCase001,
  seedCase002,
  seedCase003,
  seedCase004,
  seedCase005,
] as const;

function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

async function seedAdmin(): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `brief-admin-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Brief Admin" }),
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
  if (!row?.id) throw new Error("admin seed failed");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("brief admin org seed failed");
  return {
    cookie: cookiesFrom(signIn),
    userId: row.id,
    organizationId: memberRow.organization_id,
  };
}

async function seedCases(adminUserId: string, organizationId: string): Promise<void> {
  for (const seed of SEED_DATA) {
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
  let adminOrgId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await seedAdmin();
    adminCookie = admin.cookie;
    adminUserId = admin.userId;
    adminOrgId = admin.organizationId;
    await seedCases(adminUserId, adminOrgId);
  }, 60_000);

  it
    .skipIf(!RUN_REMOTE_VECTORIZE)
    .each(SEED_CASE_IDS.slice(0, 5).map((id, index) => [id, index] as const))(
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

      const briefRow = await env.DB.prepare(
        "SELECT id, run_id, payload_json FROM briefs WHERE case_id = ?",
      )
        .bind(caseId)
        .first<{ id: string; run_id: string; payload_json: string }>();
      expect(briefRow).toBeTruthy();
      /*
       * Documentary-seed contract (PR test plan item 1): every brief
       * persists with `recommendation === "READY_FOR_REVIEW"` and
       * `verification_path === "documentary"`. Asserting on the parsed
       * payload (not just the row existing) catches a class of
       * regressions where the brief lands with a different
       * recommendation but the workflow still finishes successfully.
       */
      const brief = BriefPayloadSchema.parse(JSON.parse(briefRow?.payload_json ?? "{}"));
      expect(brief.recommendation).toBe("READY_FOR_REVIEW");
      expect(brief.verification_path).toBe("documentary");

      /**
       * Phase-4 signal contract: every workflow run emits exactly three
       * signal rows — `photo_dup`, `story_coherence`, `vouching_chain`
       * — scoped to the brief's `run_id`. Documentary cases ride the
       * same parallel signal block as community-vouching cases, so
       * regressing the upsert wiring in photoSignal or storyCoherence
       * would manifest here as a row-count drift. Catches a class of
       * bug Review 5 flagged: docs E2E previously skipped Phase-4
       * checks and broken signal wiring would have shipped silently.
       */
      const signalRows = await env.DB.prepare(
        "SELECT signal_type FROM signals WHERE case_id = ? AND run_id = ?",
      )
        .bind(caseId, briefRow?.run_id)
        .all<{ signal_type: string }>();
      const types = signalRows.results.map((row) => row.signal_type).sort();
      expect(types).toEqual(["photo_dup", "story_coherence", "vouching_chain"]);

      /**
       * Phase 7 HITL gate inserts `awaitReviewerAction` between
       * composeBrief and finalizeCaseStatus, so a Mode A SSE run
       * terminates at SUSPENDED_HITL (not READY_FOR_REVIEW). The
       * reviewer-action resume path that flips to ACTIONED is
       * covered separately by the action-route + HITL integration
       * tests.
       */
      const caseRow = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
        .bind(caseId)
        .first<{ status: string }>();
      expect(caseRow?.status).toBe("SUSPENDED_HITL");

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
    const seed = seedCase001 as SeedJson;
    await env.DB.prepare(
      `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
       VALUES (?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        caseId,
        seed.category,
        seed.geography,
        seed.claimed_zakat_category,
        JSON.stringify({
          story: seed.story,
          organizer_name: seed.organizer_name,
        }),
        adminUserId,
        adminOrgId,
        Date.now(),
        Date.now(),
      )
      .run();
    await seedDocuments({ caseId, organizationId: adminOrgId, keys: seed.r2_keys });

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

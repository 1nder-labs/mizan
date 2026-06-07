/**
 * Integration tests: GET /api/cases/:id/signals route.
 *
 * Covers:
 * - Auth gate: anon 401.
 * - Latest-per-type dedup: two rows of the same signal_type, only the
 *   newest `recorded_at` is returned.
 * - Multiple distinct signal_types: both appear in response.
 * - Empty case: no signals seeded → `{ signals: [] }`.
 * - Org-scoping: a case in another org is blocked by the per-case access gate
 *   (requireCaseAccess) with a 404 — no cross-tenant existence leak.
 * - Schema: every response validates against CaseSignalsResponseSchema.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { CaseSignalsResponseSchema } from "@mizan/shared";

const BASE = "http://localhost";

/**
 * Signs up a reviewer account and returns the session cookie, userId, and
 * the auto-provisioned organizationId from the `members` table.
 */
async function seedReviewer(
  label: string,
): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `signals-${label}-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: `Signals ${label}` }),
    }),
  );
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const userRow = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!userRow?.id) throw new Error(`reviewer seed (${label}) failed — user not found`);
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(userRow.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id)
    throw new Error(`reviewer seed (${label}) failed — member not found`);
  return {
    cookie: signIn.headers.getSetCookie().join("; "),
    userId: userRow.id,
    organizationId: memberRow.organization_id,
  };
}

/** Inserts a case row with an explicit organization_id. */
async function insertCase(opts: {
  id: string;
  createdBy: string;
  organizationId: string;
}): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases
       (id, status, category, geography, claimed_zakat_category, brief_partial_json,
        created_by, organization_id, created_at, updated_at)
     VALUES (?, 'DRAFT', 'humanitarian', 'US', NULL, NULL, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(opts.id, opts.createdBy, opts.organizationId, now, now)
    .run();
}

/**
 * Inserts a signal row. `recordedAt` is stored as integer milliseconds;
 * `payloadJson` is stringified inline so the caller can pass any opaque value.
 */
async function insertSignal(opts: {
  id: string;
  caseId: string;
  runId: string;
  signalType: string;
  payloadJson: string;
  recordedAt: number;
  organizationId: string;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO signals
       (id, case_id, run_id, signal_type, payload_json, recorded_at, organization_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(case_id, run_id, signal_type) DO UPDATE SET
       recorded_at = excluded.recorded_at`,
  )
    .bind(
      opts.id,
      opts.caseId,
      opts.runId,
      opts.signalType,
      opts.payloadJson,
      opts.recordedAt,
      opts.organizationId,
    )
    .run();
}

describe("GET /api/cases/:id/signals", () => {
  let cookie = "";
  let userId = "";
  let organizationId = "";

  let otherCookie = "";
  let otherUserId = "";
  let otherOrganizationId = "";

  const CASE_DEDUP_ID = "51900000-0000-4000-8000-000000000001";
  const CASE_MULTI_ID = "51900000-0000-4000-8000-000000000002";
  const CASE_EMPTY_ID = "51900000-0000-4000-8000-000000000003";
  const CASE_OTHER_ORG_ID = "51900000-0000-4000-8000-000000000004";

  const RUN_A = crypto.randomUUID();
  const RUN_B = crypto.randomUUID();
  const RUN_C = crypto.randomUUID();
  const RUN_D = crypto.randomUUID();
  const RUN_OTHER = crypto.randomUUID();

  const BASE_TIME = Date.now();
  const OLDER_TIME = BASE_TIME - 5000;
  const NEWER_TIME = BASE_TIME - 1000;

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));

    const viewer = await seedReviewer("viewer");
    cookie = viewer.cookie;
    userId = viewer.userId;
    organizationId = viewer.organizationId;

    const other = await seedReviewer("other");
    otherCookie = other.cookie;
    otherUserId = other.userId;
    otherOrganizationId = other.organizationId;

    await insertCase({ id: CASE_DEDUP_ID, createdBy: userId, organizationId });
    await insertCase({ id: CASE_MULTI_ID, createdBy: userId, organizationId });
    await insertCase({ id: CASE_EMPTY_ID, createdBy: userId, organizationId });
    await insertCase({
      id: CASE_OTHER_ORG_ID,
      createdBy: otherUserId,
      organizationId: otherOrganizationId,
    });

    await insertSignal({
      id: crypto.randomUUID(),
      caseId: CASE_DEDUP_ID,
      runId: RUN_A,
      signalType: "registry_lookup",
      payloadJson: JSON.stringify({ score: 0.1 }),
      recordedAt: OLDER_TIME,
      organizationId,
    });

    await insertSignal({
      id: crypto.randomUUID(),
      caseId: CASE_DEDUP_ID,
      runId: RUN_B,
      signalType: "registry_lookup",
      payloadJson: JSON.stringify({ score: 0.9 }),
      recordedAt: NEWER_TIME,
      organizationId,
    });

    await insertSignal({
      id: crypto.randomUUID(),
      caseId: CASE_MULTI_ID,
      runId: RUN_C,
      signalType: "registry_lookup",
      payloadJson: JSON.stringify({ score: 0.5 }),
      recordedAt: BASE_TIME - 3000,
      organizationId,
    });

    await insertSignal({
      id: crypto.randomUUID(),
      caseId: CASE_MULTI_ID,
      runId: RUN_D,
      signalType: "sanctions_screen",
      payloadJson: JSON.stringify({ flagged: false }),
      recordedAt: BASE_TIME - 2000,
      organizationId,
    });

    await insertSignal({
      id: crypto.randomUUID(),
      caseId: CASE_OTHER_ORG_ID,
      runId: RUN_OTHER,
      signalType: "registry_lookup",
      payloadJson: JSON.stringify({ score: 0.7 }),
      recordedAt: BASE_TIME,
      organizationId: otherOrganizationId,
    });
  }, 60_000);

  it("anon request returns 401", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_MULTI_ID}/signals`),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 and validates against CaseSignalsResponseSchema", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_MULTI_ID}/signals`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => CaseSignalsResponseSchema.parse(body)).not.toThrow();
  });

  it("returns only the newest signal when two rows share the same signal_type", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_DEDUP_ID}/signals`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = CaseSignalsResponseSchema.parse(await res.json());
    expect(body.signals).toHaveLength(1);
    const entry = body.signals[0];
    expect(entry?.signal_type).toBe("registry_lookup");
    expect(entry?.run_id).toBe(RUN_B);
    expect(entry?.recorded_at).toBe(NEWER_TIME);
  });

  it("returns one entry per distinct signal_type", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_MULTI_ID}/signals`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = CaseSignalsResponseSchema.parse(await res.json());
    expect(body.signals).toHaveLength(2);
    const types = body.signals.map((s) => s.signal_type).sort();
    expect(types).toEqual(["registry_lookup", "sanctions_screen"]);
  });

  it("returns 200 with empty signals array when case has no signals", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_EMPTY_ID}/signals`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = CaseSignalsResponseSchema.parse(await res.json());
    expect(body.signals).toEqual([]);
  });

  it("a case in another org returns 404 — the access gate blocks cross-tenant reads", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_OTHER_ORG_ID}/signals`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("the other-org viewer sees their own signal on the same case", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_OTHER_ORG_ID}/signals`, {
        headers: { Cookie: otherCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = CaseSignalsResponseSchema.parse(await res.json());
    expect(body.signals).toHaveLength(1);
    expect(body.signals[0]?.run_id).toBe(RUN_OTHER);
  });
});

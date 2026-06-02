/**
 * Integration tests: GET /api/cases/:id (case detail) read route.
 *
 * Covers:
 * - 404 on unknown UUID.
 * - 400 on non-UUID id (zValidator).
 * - 200 on valid case: response validates against CaseDetailResponseSchema.
 * - brief present when a brief exists; brief null when none.
 * - No internal columns leak: response.case keys equal public schema keys exactly.
 * - latest_brief populated in case field when brief exists, null otherwise.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { CaseDetailResponseSchema, CaseRowSchema } from "@mizan/shared";

const BASE = "http://localhost";

/** Signs up a reviewer and returns the session cookie, userId, and organizationId. */
async function seedReviewer(): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `detail-reviewer-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Detail Reviewer" }),
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
  if (!row?.id) throw new Error("reviewer seed failed");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("reviewer org seed failed");
  return {
    cookie: signIn.headers.getSetCookie().join("; "),
    userId: row.id,
    organizationId: memberRow.organization_id,
  };
}

/** Inserts a minimal case row into D1. */
async function insertCase(opts: {
  id: string;
  status: string;
  category: string;
  geography: string;
  createdBy: string;
  organizationId: string;
}): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       updated_at = excluded.updated_at`,
  )
    .bind(
      opts.id,
      opts.status,
      opts.category,
      opts.geography,
      opts.createdBy,
      opts.organizationId,
      now,
      now,
    )
    .run();
}

/** Inserts a brief row for a case. */
async function insertBrief(opts: {
  id: string;
  caseId: string;
  runId: string;
  recommendation: string;
  verificationPath: string;
  organizationId: string;
}): Promise<void> {
  const payload = JSON.stringify({
    recommendation: opts.recommendation,
    verification_path: opts.verificationPath,
    geography_tier: "SAFE",
    policy_grounded: true,
    missing_docs: [],
    reviewer_questions: [],
    extracted_claims: "Verified claims for test.",
    confidence: 75,
    policy_citations: [],
  });
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO briefs (id, case_id, run_id, recommendation, confidence, composed_at, payload_json, organization_id)
     VALUES (?, ?, ?, ?, 75, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(opts.id, opts.caseId, opts.runId, opts.recommendation, now, payload, opts.organizationId)
    .run();
}

describe("GET /api/cases/:id — case detail route", () => {
  let cookie = "";
  let userId = "";
  let organizationId = "";

  const CASE_WITH_BRIEF_ID = "de000000-0000-4000-8000-000000000001";
  const CASE_NO_BRIEF_ID = "de000000-0000-4000-8000-000000000002";
  const BRIEF_ID = "bf000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewer = await seedReviewer();
    cookie = reviewer.cookie;
    userId = reviewer.userId;
    organizationId = reviewer.organizationId;

    await insertCase({
      id: CASE_WITH_BRIEF_ID,
      status: "READY_FOR_REVIEW",
      category: "medical",
      geography: "US",
      createdBy: userId,
      organizationId,
    });

    await insertCase({
      id: CASE_NO_BRIEF_ID,
      status: "DRAFT",
      category: "education",
      geography: "UK",
      createdBy: userId,
      organizationId,
    });

    await insertBrief({
      id: BRIEF_ID,
      caseId: CASE_WITH_BRIEF_ID,
      runId: "run-de-01",
      recommendation: "READY_FOR_REVIEW",
      verificationPath: "institutional_vouching",
      organizationId,
    });
  }, 60_000);

  it("returns 404 on unknown UUID", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/00000000-0000-4000-8000-000000000000`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on non-UUID id", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/not-a-uuid`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 on valid case and validates against CaseDetailResponseSchema", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_BRIEF_ID}`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => CaseDetailResponseSchema.parse(body)).not.toThrow();
  });

  it("brief is present when a brief exists for the case", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_BRIEF_ID}`, {
        headers: { Cookie: cookie },
      }),
    );
    const body = CaseDetailResponseSchema.parse(await res.json());
    expect(body.brief).not.toBeNull();
    expect(body.brief?.recommendation).toBe("READY_FOR_REVIEW");
  });

  it("brief is null when no brief exists for the case", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_NO_BRIEF_ID}`, {
        headers: { Cookie: cookie },
      }),
    );
    const body = CaseDetailResponseSchema.parse(await res.json());
    expect(body.brief).toBeNull();
  });

  it("latest_brief populated in case when brief exists", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_BRIEF_ID}`, {
        headers: { Cookie: cookie },
      }),
    );
    const body = CaseDetailResponseSchema.parse(await res.json());
    expect(body.case.latest_brief).toEqual({
      recommendation: "READY_FOR_REVIEW",
      verification_path: "institutional_vouching",
    });
  });

  it("latest_brief is null in case when no brief exists", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_NO_BRIEF_ID}`, {
        headers: { Cookie: cookie },
      }),
    );
    const body = CaseDetailResponseSchema.parse(await res.json());
    expect(body.case.latest_brief).toBeNull();
  });

  it("response.case keys exactly equal public CaseRowSchema keys — no internal columns leak", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_BRIEF_ID}`, {
        headers: { Cookie: cookie },
      }),
    );
    const body = CaseDetailResponseSchema.parse(await res.json());
    const responseKeys = Object.keys(body.case).sort();
    const schemaKeys = Object.keys(CaseRowSchema.shape).sort();
    expect(responseKeys).toEqual(schemaKeys);
  });
});

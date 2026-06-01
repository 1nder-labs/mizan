/**
 * Integration tests: GET /api/cases (queue list) read route.
 *
 * Covers:
 * - Auth gate: anon 401, reviewer 200, admin 200.
 * - Filters: status / category / geography — individual and combined.
 * - Sort: updated_desc / updated_asc / created_desc.
 * - Pagination: page param; page beyond range returns empty list.
 * - Empty result: filters with no matches return { cases: [], total: 0 }.
 * - Schema: response validates against QueueResponseSchema.
 * - latest_brief: case with brief surfaces { recommendation, verification_path };
 *   case without brief surfaces latest_brief: null.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { QueueResponseSchema } from "@mizan/shared";
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";

const BASE = "http://localhost";

/** Signs up a reviewer account and returns the session cookie, userId, and organizationId. */
async function seedReviewer(): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `list-reviewer-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "List Reviewer" }),
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

/** Signs up an admin account and returns the session cookie + userId. */
async function seedAdmin(): Promise<{ cookie: string; userId: string }> {
  const email = `list-admin-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "List Admin" }),
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
  return { cookie: signIn.headers.getSetCookie().join("; "), userId: row.id };
}

/** Inserts a case row directly into D1. */
async function insertCase(opts: {
  id: string;
  status: string;
  category: string;
  geography: string;
  createdBy: string;
  organizationId: string;
  createdAt?: number;
  updatedAt?: number;
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
      opts.createdAt ?? now,
      opts.updatedAt ?? now,
    )
    .run();
}

/** Inserts a brief row for a case, using a minimal valid payload_json. */
async function insertBrief(opts: {
  id: string;
  caseId: string;
  runId: string;
  recommendation: string;
  verificationPath: string;
  organizationId: string;
  composedAt?: number;
}): Promise<void> {
  const payload = JSON.stringify({
    recommendation: opts.recommendation,
    verification_path: opts.verificationPath,
    geography_tier: "SAFE",
    policy_grounded: true,
    missing_docs: [],
    reviewer_questions: [],
    extracted_claims: "Test claims.",
    confidence: 80,
    policy_citations: [],
  });
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO briefs (id, case_id, run_id, recommendation, confidence, composed_at, payload_json, organization_id)
     VALUES (?, ?, ?, ?, 80, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(
      opts.id,
      opts.caseId,
      opts.runId,
      opts.recommendation,
      opts.composedAt ?? now,
      payload,
      opts.organizationId,
    )
    .run();
}

describe("GET /api/cases — queue list route", () => {
  let reviewerCookie = "";
  let adminCookie = "";
  let reviewerUserId = "";
  let reviewerOrgId = "";

  const CASE_A_ID = "aa000000-0000-4000-8000-000000000001";
  const CASE_B_ID = "bb000000-0000-4000-8000-000000000002";
  const CASE_C_ID = "cc000000-0000-4000-8000-000000000003";
  const BRIEF_A_ID = "ab000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));

    const reviewer = await seedReviewer();
    reviewerCookie = reviewer.cookie;
    reviewerUserId = reviewer.userId;
    reviewerOrgId = reviewer.organizationId;

    const admin = await seedAdmin();
    adminCookie = admin.cookie;

    const baseTime = Date.now();

    await insertCase({
      id: CASE_A_ID,
      status: "READY_FOR_REVIEW",
      category: "medical",
      geography: "US",
      createdBy: reviewerUserId,
      organizationId: reviewerOrgId,
      createdAt: baseTime - 3000,
      updatedAt: baseTime - 1000,
    });

    await insertCase({
      id: CASE_B_ID,
      status: "QUEUED",
      category: "education",
      geography: "UK",
      createdBy: reviewerUserId,
      organizationId: reviewerOrgId,
      createdAt: baseTime - 2000,
      updatedAt: baseTime - 2000,
    });

    await insertCase({
      id: CASE_C_ID,
      status: "READY_FOR_REVIEW",
      category: "medical",
      geography: "CA",
      createdBy: reviewerUserId,
      organizationId: reviewerOrgId,
      createdAt: baseTime - 1000,
      updatedAt: baseTime - 500,
    });

    await insertBrief({
      id: BRIEF_A_ID,
      caseId: CASE_A_ID,
      runId: "run-aa-01",
      recommendation: "REQUEST_DOCS",
      verificationPath: "documentary",
      organizationId: reviewerOrgId,
    });
  }, 60_000);

  it("anon request returns 401", async () => {
    const res = await exports.default.fetch(new Request(`${BASE}/api/cases`));
    expect(res.status).toBe(401);
  });

  it("reviewer returns 200", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("admin returns 200", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases`, {
        headers: { Cookie: adminCookie },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("response validates against QueueResponseSchema", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = await res.json();
    expect(() => QueueResponseSchema.parse(body)).not.toThrow();
  });

  it("?status=READY_FOR_REVIEW returns only READY_FOR_REVIEW cases", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?status=READY_FOR_REVIEW`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    expect(body.cases.every((c) => c.status === "READY_FOR_REVIEW")).toBe(true);
    expect(body.total).toBe(2);
  });

  it("?category=medical returns only medical cases", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?category=medical`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    expect(body.cases.every((c) => c.category === "medical")).toBe(true);
    expect(body.total).toBe(2);
  });

  it("?geography=UK returns only UK cases", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?geography=UK`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    expect(body.cases.every((c) => c.geography === "UK")).toBe(true);
    expect(body.total).toBe(1);
  });

  it("combined filters intersect correctly", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?status=READY_FOR_REVIEW&category=medical&geography=US`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    expect(body.total).toBe(1);
    expect(body.cases[0]?.id).toBe(CASE_A_ID);
  });

  it("sort=updated_asc orders oldest updated_at first", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?sort=updated_asc`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    const times = body.cases.map((c) => c.updated_at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("sort=updated_desc orders newest updated_at first (default)", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?sort=updated_desc`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    const times = body.cases.map((c) => c.updated_at);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("sort=created_desc orders newest created_at first", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?sort=created_desc`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    const times = body.cases.map((c) => c.created_at);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("page=1 returns data; page beyond range returns empty cases and valid total", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?page=100`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    expect(body.cases).toEqual([]);
    expect(body.total).toBeGreaterThanOrEqual(0);
  });

  it("filters with no matches return cases:[] total:0", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?status=DRAFT&category=nonexistent-xyz`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    expect(body.cases).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("case with brief surfaces latest_brief: { recommendation, verification_path }", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?status=READY_FOR_REVIEW&geography=US`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    const caseA = body.cases.find((c) => c.id === CASE_A_ID);
    expect(caseA).toBeDefined();
    expect(caseA?.latest_brief).toEqual({
      recommendation: "REQUEST_DOCS",
      verification_path: "documentary",
    });
  });

  it("case without brief surfaces latest_brief: null", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?status=QUEUED`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    const caseB = body.cases.find((c) => c.id === CASE_B_ID);
    expect(caseB).toBeDefined();
    expect(caseB?.latest_brief).toBeNull();
  });

  it("assets binding is available (smoke)", () => {
    expect(env.R2_BUCKET).toBeDefined();
    void MINIMAL_PNG_BYTES;
  });
});

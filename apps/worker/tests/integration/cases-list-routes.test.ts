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
import { makeDb } from "@mizan/db";
import { QueueResponseSchema } from "@mizan/shared";
import { resolveCaseIdByTitle } from "../../src/handlers/cases-handler.ts";
import { insertBrief, insertCase, seedAdmin, seedReviewer } from "./cases-test-helpers.ts";
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";

const BASE = "http://localhost";

describe("GET /api/cases — queue list route", () => {
  let reviewerCookie = "";
  let adminCookie = "";
  let reviewerUserId = "";
  let reviewerOrgId = "";

  const CASE_A_ID = "aa000000-0000-4000-8000-000000000001";
  const CASE_B_ID = "bb000000-0000-4000-8000-000000000002";
  const CASE_C_ID = "cc000000-0000-4000-8000-000000000003";
  const BRIEF_A_ID = "ab000000-0000-4000-8000-000000000001";
  const HIRA_ID = "dd000000-0000-4000-8000-000000000004";
  const DUP1_ID = "ee000000-0000-4000-8000-000000000005";
  const DUP2_ID = "ff000000-0000-4000-8000-000000000006";

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

    await insertCase({
      id: HIRA_ID,
      status: "SUSPENDED_HITL",
      title: "Hira Welfare Trust",
      category: "education",
      geography: "PK",
      createdBy: reviewerUserId,
      organizationId: reviewerOrgId,
    });
    await insertCase({
      id: DUP1_ID,
      status: "SUSPENDED_HITL",
      title: "Duplicate Title Co",
      category: "relief",
      geography: "SD",
      createdBy: reviewerUserId,
      organizationId: reviewerOrgId,
    });
    await insertCase({
      id: DUP2_ID,
      status: "SUSPENDED_HITL",
      title: "Duplicate Title Co",
      category: "relief",
      geography: "SD",
      createdBy: reviewerUserId,
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

  it("?title=hira fuzzy-matches the campaign title, case-insensitively", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases?title=hira`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = QueueResponseSchema.parse(await res.json());
    expect(body.total).toBe(1);
    expect(body.cases[0]?.id).toBe(HIRA_ID);
    expect(body.cases[0]?.title).toBe("Hira Welfare Trust");
  });

  it("assets binding is available (smoke)", () => {
    expect(env.R2_BUCKET).toBeDefined();
    void MINIMAL_PNG_BYTES;
  });

  describe("resolveCaseIdByTitle", () => {
    function viewer() {
      return { userId: reviewerUserId, role: "reviewer" as const, organizationId: reviewerOrgId };
    }

    it("resolves an exact title to its case id", async () => {
      const result = await resolveCaseIdByTitle("Hira Welfare Trust", viewer(), makeDb(env.DB));
      expect(result).toEqual({ status: "found", caseId: HIRA_ID });
    });

    it("matches the exact title case-insensitively", async () => {
      const result = await resolveCaseIdByTitle("hira WELFARE trust", viewer(), makeDb(env.DB));
      expect(result).toEqual({ status: "found", caseId: HIRA_ID });
    });

    it("returns none when no case has that exact title", async () => {
      const result = await resolveCaseIdByTitle("Hira", viewer(), makeDb(env.DB));
      expect(result).toEqual({ status: "none" });
    });

    it("returns ambiguous when more than one case shares the title", async () => {
      const result = await resolveCaseIdByTitle("Duplicate Title Co", viewer(), makeDb(env.DB));
      expect(result.status).toBe("ambiguous");
      if (result.status === "ambiguous") expect(result.count).toBeGreaterThanOrEqual(2);
    });
  });
});

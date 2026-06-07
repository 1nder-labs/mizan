/**
 * Integration tests: GET /api/cases/:id/briefs (brief run history).
 *
 * Covers:
 * - Auth gate: anon 401.
 * - Ordering: multiple runs return newest-composed first, each carrying
 *   run_id + recommendation + confidence + composed_at + payload_json.
 * - Empty: a visible case with no briefs returns { briefs: [] } (200, not 404).
 * - Not found: an unknown case id returns 404.
 * - Schema: response validates against BriefHistoryResponseSchema.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BriefHistoryResponseSchema } from "@mizan/shared";
import { insertBrief, insertCase, seedReviewer } from "./cases-test-helpers.ts";

const BASE = "http://localhost";

describe("GET /api/cases/:id/briefs — brief history route", () => {
  let reviewerCookie = "";
  let reviewerUserId = "";
  let reviewerOrgId = "";

  const CASE_MULTI = "a1000000-0000-4000-8000-0000000000a1";
  const CASE_EMPTY = "a2000000-0000-4000-8000-0000000000a2";
  const MISSING_ID = "a9000000-0000-4000-8000-0000000000a9";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewer = await seedReviewer();
    reviewerCookie = reviewer.cookie;
    reviewerUserId = reviewer.userId;
    reviewerOrgId = reviewer.organizationId;

    const baseTime = Date.now();
    await insertCase({
      id: CASE_MULTI,
      status: "ACTIONED",
      category: "medical",
      geography: "US",
      createdBy: reviewerUserId,
      organizationId: reviewerOrgId,
    });
    await insertCase({
      id: CASE_EMPTY,
      status: "DRAFT",
      category: "education",
      geography: "UK",
      createdBy: reviewerUserId,
      organizationId: reviewerOrgId,
    });

    await insertBrief({
      id: "b1000000-0000-4000-8000-0000000000b1",
      caseId: CASE_MULTI,
      runId: "run-hist-1",
      recommendation: "REQUEST_DOCS",
      verificationPath: "documentary",
      organizationId: reviewerOrgId,
      composedAt: baseTime - 3000,
    });
    await insertBrief({
      id: "b2000000-0000-4000-8000-0000000000b2",
      caseId: CASE_MULTI,
      runId: "run-hist-2",
      recommendation: "ESCALATE",
      verificationPath: "documentary",
      organizationId: reviewerOrgId,
      composedAt: baseTime - 2000,
    });
    await insertBrief({
      id: "b3000000-0000-4000-8000-0000000000b3",
      caseId: CASE_MULTI,
      runId: "run-hist-3",
      recommendation: "READY_FOR_REVIEW",
      verificationPath: "documentary",
      organizationId: reviewerOrgId,
      composedAt: baseTime - 1000,
    });
  }, 60_000);

  it("anon request returns 401", async () => {
    const res = await exports.default.fetch(new Request(`${BASE}/api/cases/${CASE_MULTI}/briefs`));
    expect(res.status).toBe(401);
  });

  it("returns every run newest-composed first with full entry fields", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_MULTI}/briefs`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = BriefHistoryResponseSchema.parse(await res.json());
    expect(body.briefs.map((b) => b.run_id)).toEqual(["run-hist-3", "run-hist-2", "run-hist-1"]);
    expect(body.briefs.map((b) => b.recommendation)).toEqual([
      "READY_FOR_REVIEW",
      "ESCALATE",
      "REQUEST_DOCS",
    ]);
    const newest = body.briefs[0];
    expect(newest?.confidence).toBe(80);
    expect(newest?.payload_json.recommendation).toBe("READY_FOR_REVIEW");
    expect(typeof newest?.composed_at).toBe("number");
  });

  it("composed_at is strictly descending", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_MULTI}/briefs`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    const body = BriefHistoryResponseSchema.parse(await res.json());
    const times = body.briefs.map((b) => b.composed_at);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("a visible case with no briefs returns an empty list, not 404", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_EMPTY}/briefs`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = BriefHistoryResponseSchema.parse(await res.json());
    expect(body.briefs).toEqual([]);
  });

  it("an unknown case id returns 404", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${MISSING_ID}/briefs`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    expect(res.status).toBe(404);
  });
});

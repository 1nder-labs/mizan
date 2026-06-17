/**
 * Integration: GET /api/cases/:id/brief/stream (resumeBriefStream) HTTP contract.
 *
 * Locks:
 * - 204 when the case has no active run (`current_run_id` IS NULL).
 * - 401 when no session cookie is present (`requireRole` gate).
 * - 404 for a case belonging to another org (`requireCaseAccess` cross-org guard).
 * - 404 for an unknown case id (`resumeBriefStream` queries the row — not found).
 * - 200 + `text/event-stream` when `current_run_id` is set (DO subscription opened).
 *
 * The DO returns an open / never-finishing stream when there is no active consumer;
 * assertions therefore target status + header only and cancel immediately after.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BASE, insertDraftCase, seedAdmin, seedCaseStatus } from "./mode-b-helpers.ts";

describe("GET /api/cases/:id/brief/stream (resumeBriefStream)", () => {
  let adminCookie = "";
  let adminUserId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await seedAdmin();
    adminCookie = admin.cookie;
    adminUserId = admin.userId;
  }, 60_000);

  it("204 when the case has no active run", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief/stream`, {
        headers: { Cookie: adminCookie },
      }),
    );
    expect(res.status).toBe(204);
  });

  it("401 without a session cookie", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief/stream`),
    );
    expect(res.status).toBe(401);
  });

  it("404 for a case in another org (cross-org access denied)", async () => {
    const secondAdmin = await seedAdmin();
    const foreignCaseId = crypto.randomUUID();
    await insertDraftCase(foreignCaseId, secondAdmin.userId);

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${foreignCaseId}/brief/stream`, {
        headers: { Cookie: adminCookie },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("404 for an unknown case id", async () => {
    const unknownId = crypto.randomUUID();

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${unknownId}/brief/stream`, {
        headers: { Cookie: adminCookie },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("200 text/event-stream when current_run_id is set", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "QUEUED", runId });

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief/stream`, {
        headers: { Cookie: adminCookie },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();
  });
});

/**
 * Integration: POST /api/cases/:id/brief producer-guard decisions.
 *
 * Locks the rejoin-vs-claim-vs-409 contract at the HTTP layer:
 * - RUNNING case → 200 SSE, runId and status UNCHANGED in DB (REJOIN).
 * - QUEUED  case → 200 SSE, runId and status UNCHANGED in DB (REJOIN).
 * - DRAFT   case → 200 SSE, DB row flips to QUEUED with a FRESH runId (CLAIM).
 * - ACTIONED case      → 409 (terminal, cannot resume).
 * - SUSPENDED_HITL case → 409 (terminal, cannot resume).
 *
 * No workflow runs during these tests — assertions are limited to HTTP status +
 * content-type header + DB state. SSE bodies are cancelled immediately after
 * reading headers to avoid hanging on the never-finishing DO stream.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BASE, insertDraftCase, seedAdmin, seedCaseStatus } from "./mode-b-helpers.ts";

describe("POST /api/cases/:id/brief rejoin-vs-claim-vs-409 contract", () => {
  let adminCookie = "";
  let adminUserId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await seedAdmin();
    adminCookie = admin.cookie;
    adminUserId = admin.userId;
  }, 60_000);

  /** Posts to the brief endpoint with the admin session and a fresh idempotency key. */
  async function postBrief(caseId: string): Promise<Response> {
    return exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief`, {
        method: "POST",
        headers: {
          Cookie: adminCookie,
          Accept: "text/event-stream",
          "Idempotency-Key": crypto.randomUUID(),
        },
      }),
    );
  }

  it("POST on a RUNNING case REJOINS without minting a new run", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "RUNNING", runId });

    const res = await postBrief(caseId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();

    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("RUNNING");
    expect(row?.current_run_id).toBe(runId);
  });

  it("POST on a QUEUED case REJOINS without minting a new run", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "QUEUED", runId });

    const res = await postBrief(caseId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();

    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("QUEUED");
    expect(row?.current_run_id).toBe(runId);
  });

  it("POST on a DRAFT case CLAIMS a fresh run", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);

    const res = await postBrief(caseId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();

    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string | null }>();
    expect(row?.status).toBe("QUEUED");
    expect(row?.current_run_id).not.toBeNull();
    expect(typeof row?.current_run_id).toBe("string");
  });

  it("POST on an ACTIONED case is 409", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "ACTIONED", runId });

    const res = await postBrief(caseId);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; current_status: string };
    expect(body.error).toBe("invalid_source_status");
    expect(body.current_status).toBe("ACTIONED");
  });

  it("POST on a SUSPENDED_HITL case is 409", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "SUSPENDED_HITL", runId });

    const res = await postBrief(caseId);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; current_status: string };
    expect(body.error).toBe("invalid_source_status");
    expect(body.current_status).toBe("SUSPENDED_HITL");
  });
});

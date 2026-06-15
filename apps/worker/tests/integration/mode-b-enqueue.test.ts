/**
 * Integration tests: POST /api/cases/:id/brief enqueue path.
 *
 * The route now always returns `text/event-stream` (200). Never read the SSE
 * body to completion — the stream stays open until the workflow finishes, which
 * requires real LLM + Vectorize and would hang the suite. Assertions target:
 * - HTTP 200 + `content-type: text/event-stream` header
 * - DB row state (status, current_run_id)
 * - Exactly one queue send for a fresh run (proven by row-became-QUEUED + no
 *   row mutation for replay). Full queue-send counting is not spied here — that
 *   level is covered by the queue consumer idempotency suite.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BriefQueueMessageSchema } from "@mizan/shared";
import {
  BASE,
  insertDraftCase,
  putSeedAssets,
  seedAdmin,
  seedCaseStatus,
} from "./mode-b-helpers.ts";

describe("Mode B enqueue", () => {
  let adminCookie = "";
  let adminUserId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await seedAdmin();
    adminCookie = admin.cookie;
    adminUserId = admin.userId;
    await putSeedAssets();
  }, 60_000);

  async function postBrief(caseId: string): Promise<Response> {
    return exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief`, {
        method: "POST",
        headers: {
          Cookie: adminCookie,
          "Idempotency-Key": crypto.randomUUID(),
        },
      }),
    );
  }

  it("DRAFT case → 200 text/event-stream + row becomes QUEUED with a new runId", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    const res = await postBrief(caseId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();

    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("QUEUED");
    expect(typeof row?.current_run_id).toBe("string");
    BriefQueueMessageSchema.parse({
      caseId,
      runId: row?.current_run_id,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
  }, 30_000);

  it("FAILED case → 200 SSE with fresh runId (not the stale one)", async () => {
    const caseId = crypto.randomUUID();
    const staleRunId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "FAILED", runId: staleRunId });

    const res = await postBrief(caseId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();

    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("QUEUED");
    expect(row?.current_run_id).not.toBe(staleRunId);
    expect(typeof row?.current_run_id).toBe("string");
  }, 30_000);

  it("QUEUED in-flight → 200 SSE, same runId, row unchanged (no re-enqueue)", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "QUEUED", runId });

    const res = await postBrief(caseId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();

    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("QUEUED");
    expect(row?.current_run_id).toBe(runId);
  }, 30_000);

  it("RUNNING in-flight → 200 SSE, same runId, row unchanged (no re-enqueue)", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "RUNNING", runId });

    const res = await postBrief(caseId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();

    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("RUNNING");
    expect(row?.current_run_id).toBe(runId);
  }, 30_000);

  it("SUSPENDED_HITL → 409 invalid_source_status (not an enqueue, not SSE)", async () => {
    const caseId = crypto.randomUUID();
    const completedRunId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "SUSPENDED_HITL", runId: completedRunId });

    const res = await postBrief(caseId);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; current_status: string };
    expect(body.error).toBe("invalid_source_status");
    expect(body.current_status).toBe("SUSPENDED_HITL");
  }, 30_000);

  it("nanoid-format adminUserId is valid as requestedBy in BriefQueueMessageSchema", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidPattern.test(adminUserId)).toBe(false);

    const res = await postBrief(caseId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();

    const row = await env.DB.prepare("SELECT current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ current_run_id: string }>();
    BriefQueueMessageSchema.parse({
      caseId,
      runId: row?.current_run_id,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
  }, 30_000);
});

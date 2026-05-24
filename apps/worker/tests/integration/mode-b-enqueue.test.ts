/**
 * Integration tests: Mode B enqueue producer branch.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BriefQueueMessageSchema } from "@mizan/shared";
import { case001Responses, serializeMockResponses } from "@mizan/mastra/testing";
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

  async function postBrief(
    caseId: string,
    accept: string,
  ): Promise<{ res: Response; body: Record<string, unknown> }> {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief`, {
        method: "POST",
        headers: {
          Cookie: adminCookie,
          Accept: accept,
          "Idempotency-Key": crypto.randomUUID(),
        },
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;
    return { res, body };
  }

  it("returns 202 QUEUED for DRAFT case with Accept application/json", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    const { res, body } = await postBrief(caseId, "application/json");
    expect(res.status).toBe(202);
    expect(body).toMatchObject({ status: "QUEUED", replay: false });
    expect(typeof body.run_id).toBe("string");
    BriefQueueMessageSchema.parse({
      caseId,
      runId: body.run_id,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("QUEUED");
    expect(row?.current_run_id).toBe(body.run_id);
  }, 30_000);

  it("returns 202 replay true for QUEUED in-flight case without double-enqueue", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "QUEUED", runId });
    const { res, body } = await postBrief(caseId, "application/json");
    expect(res.status).toBe(202);
    expect(body).toEqual({ status: "QUEUED", run_id: runId, replay: true });
  });

  it("returns 202 replay true for RUNNING in-flight case", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "RUNNING", runId });
    const { res, body } = await postBrief(caseId, "application/json");
    expect(res.status).toBe(202);
    expect(body).toEqual({ status: "RUNNING", run_id: runId, replay: true });
  });

  it("returns 202 with fresh runId when retrying FAILED case", async () => {
    const caseId = crypto.randomUUID();
    const staleRunId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "FAILED", runId: staleRunId });
    const { res, body } = await postBrief(caseId, "application/json");
    expect(res.status).toBe(202);
    expect(body).toMatchObject({ status: "QUEUED", replay: false });
    expect(body.run_id).not.toBe(staleRunId);
    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("QUEUED");
    expect(row?.current_run_id).toBe(body.run_id);
    expect(row?.current_run_id).not.toBe(staleRunId);
  });

  it("returns 409 invalid_source_status (not race) when POST hits READY_FOR_REVIEW", async () => {
    const caseId = crypto.randomUUID();
    const completedRunId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "READY_FOR_REVIEW", runId: completedRunId });
    const { res, body } = await postBrief(caseId, "application/json");
    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      error: "invalid_source_status",
      current_status: "READY_FOR_REVIEW",
    });
  });

  it("Mode A SSE path unchanged for Accept text/event-stream", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    env.MOCK_LLM_RESPONSES = serializeMockResponses(case001Responses());
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
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("RUNNING");
  }, 60_000);

  it("accepts a nanoid-format user id as requestedBy", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidPattern.test(adminUserId)).toBe(false);

    const { res, body } = await postBrief(caseId, "application/json");
    expect(res.status).toBe(202);
    expect(body).toMatchObject({ status: "QUEUED", replay: false });

    BriefQueueMessageSchema.parse({
      caseId,
      runId: body.run_id,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
  }, 30_000);
});

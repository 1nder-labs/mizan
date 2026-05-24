/**
 * Integration tests: DLQ consumer flips exhausted retries to FAILED.
 */

import { applyD1Migrations, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { z } from "zod";
import { handleBriefQueue } from "../../src/queue/brief-consumer.ts";
import { handleDlq } from "../../src/queue/dlq-consumer.ts";
import { makeTestBatch } from "../helpers/queue-batch.ts";
import {
  BASE,
  insertDraftCase,
  seedAdmin,
  getTestBindings,
  trackedMessage,
  seedCaseStatus,
} from "./mode-b-helpers.ts";

const EnqueueResponseSchema = z.object({
  status: z.string(),
  run_id: z.string(),
  replay: z.boolean(),
});

async function runDlq(body: unknown) {
  const { message, ack } = trackedMessage(body);
  await handleDlq(makeTestBatch([message], "mizan-brief-jobs-dlq"), getTestBindings());
  return ack;
}

describe("Mode B DLQ consumer", () => {
  let adminCookie = "";
  let adminUserId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await seedAdmin();
    adminCookie = admin.cookie;
    adminUserId = admin.userId;
  }, 60_000);

  it("flips QUEUED row to FAILED", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "QUEUED", runId });
    const ack = await runDlq({ caseId, runId, enqueuedAt: Date.now(), requestedBy: adminUserId });
    expect(ack).toHaveBeenCalledTimes(1);
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("FAILED");
  });

  it("flips RUNNING row to FAILED", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "RUNNING", runId });
    const ack = await runDlq({ caseId, runId, enqueuedAt: Date.now(), requestedBy: adminUserId });
    expect(ack).toHaveBeenCalledTimes(1);
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("FAILED");
  });

  it("does not mutate ACTIONED rows", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "ACTIONED", runId });
    const ack = await runDlq({ caseId, runId, enqueuedAt: Date.now(), requestedBy: adminUserId });
    expect(ack).toHaveBeenCalledTimes(1);
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("ACTIONED");
  });

  it("allows retry enqueue after DLQ flip via POST application/json", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "QUEUED", runId });
    await runDlq({ caseId, runId, enqueuedAt: Date.now(), requestedBy: adminUserId });

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief`, {
        method: "POST",
        headers: {
          Cookie: adminCookie,
          Accept: "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
      }),
    );
    expect(res.status).toBe(202);
    const body = EnqueueResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ status: "QUEUED", replay: false });
    expect(body.run_id).not.toBe(runId);
  });

  it("acks malformed DLQ messages without row mutation", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    const ack = await runDlq({ caseId });
    expect(ack).toHaveBeenCalledTimes(1);
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("DRAFT");
  });

  /**
   * End-to-end chain proof for defence-in-depth exit #3 of pattern #3
   * (cloudflare-queues-mode-b-background-engineering.md): fresh-but-
   * crashed RUNNING redeliveries retry through the queue's retry loop,
   * then on exhaustion the DLQ flips the row to FAILED, then a fresh
   * POST re-enqueues with a new runId. Cloudflare's automatic retry-
   * to-DLQ promotion is simulated by manually invoking `handleDlq`
   * once the brief consumer has retried `max_retries` times.
   */
  it("retry-running × max_retries → handleDlq flips FAILED → fresh POST gets new runId (defence-in-depth chain)", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "RUNNING", runId });

    const body = {
      caseId,
      runId,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    };

    for (const attempts of [2, 3, 4]) {
      const tracked = trackedMessage(body, { attempts });
      const ctx = createExecutionContext();
      await handleBriefQueue(makeTestBatch([tracked.message]), getTestBindings(), ctx);
      await waitOnExecutionContext(ctx);
      expect(tracked.retry).toHaveBeenCalledTimes(1);
      expect(tracked.ack).not.toHaveBeenCalled();
    }

    const midRow = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(midRow?.status).toBe("RUNNING");
    expect(midRow?.current_run_id).toBe(runId);

    const dlqAck = await runDlq(body);
    expect(dlqAck).toHaveBeenCalledTimes(1);
    const failedRow = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(failedRow?.status).toBe("FAILED");

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief`, {
        method: "POST",
        headers: {
          Cookie: adminCookie,
          Accept: "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
      }),
    );
    expect(res.status).toBe(202);
    const next = EnqueueResponseSchema.parse(await res.json());
    expect(next).toMatchObject({ status: "QUEUED", replay: false });
    expect(next.run_id).not.toBe(runId);
    const restartedRow = await env.DB.prepare(
      "SELECT status, current_run_id FROM cases WHERE id = ?",
    )
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(restartedRow?.status).toBe("QUEUED");
    expect(restartedRow?.current_run_id).toBe(next.run_id);
  }, 60_000);
});

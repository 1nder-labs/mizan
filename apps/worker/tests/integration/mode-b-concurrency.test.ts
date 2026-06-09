/**
 * Integration tests: Mode B queue consumer concurrency semantics.
 */

import { createExecutionContext, waitOnExecutionContext, applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { case001Responses, serializeMockResponses } from "@mizan/mastra/testing";
import { handleBriefQueue } from "../../src/queue/brief-consumer.ts";
import { makeTestBatch } from "../helpers/queue-batch.ts";
import {
  insertDraftCase,
  putSeedAssets,
  seedAdmin,
  getTestBindings,
  trackedMessage,
  seedCaseStatus,
} from "./mode-b-helpers.ts";
import { RUN_REMOTE_VECTORIZE } from "./remote-deps.ts";

describe.skipIf(!RUN_REMOTE_VECTORIZE)("Mode B consumer concurrency", () => {
  let adminUserId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await seedAdmin();
    adminUserId = admin.userId;
    await putSeedAssets();
    env.MOCK_LLM_RESPONSES = serializeMockResponses(case001Responses());
  }, 60_000);

  it("processes four queued cases to SUSPENDED_HITL under parallel delivery", async () => {
    const jobs = Array.from({ length: 4 }, () => ({
      caseId: crypto.randomUUID(),
      runId: crypto.randomUUID(),
    }));

    for (const job of jobs) {
      await insertDraftCase(job.caseId, adminUserId);
      await seedCaseStatus({ caseId: job.caseId, status: "QUEUED", runId: job.runId });
    }

    await Promise.all(
      jobs.map(async (job) => {
        const { message, ack } = trackedMessage({
          caseId: job.caseId,
          runId: job.runId,
          enqueuedAt: Date.now(),
          requestedBy: adminUserId,
        });
        const ctx = createExecutionContext();
        await handleBriefQueue(makeTestBatch([message]), getTestBindings(), ctx);
        await waitOnExecutionContext(ctx);
        expect(ack).toHaveBeenCalledTimes(1);
      }),
    );

    for (const job of jobs) {
      const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
        .bind(job.caseId)
        .first<{ status: string }>();
      expect(row?.status).toBe("SUSPENDED_HITL");
    }
  }, 120_000);

  it("atomic claim picks exactly one winner when two consumers receive the same caseId/runId concurrently", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "QUEUED", runId });

    const body = {
      caseId,
      runId,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    };
    const first = trackedMessage(body);
    const second = trackedMessage(body);
    const ctxA = createExecutionContext();
    const ctxB = createExecutionContext();
    await Promise.all([
      handleBriefQueue(makeTestBatch([first.message]), getTestBindings(), ctxA),
      handleBriefQueue(makeTestBatch([second.message]), getTestBindings(), ctxB),
    ]);
    await waitOnExecutionContext(ctxA);
    await waitOnExecutionContext(ctxB);

    expect(first.ack).toHaveBeenCalledTimes(1);
    expect(second.ack).toHaveBeenCalledTimes(1);
    expect(first.retry).not.toHaveBeenCalled();
    expect(second.retry).not.toHaveBeenCalled();
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("SUSPENDED_HITL");
    const signalCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM signals WHERE case_id = ? AND run_id = ?",
    )
      .bind(caseId, runId)
      .first<{ count: number }>();
    expect(signalCount?.count).toBe(3);
  }, 120_000);
});

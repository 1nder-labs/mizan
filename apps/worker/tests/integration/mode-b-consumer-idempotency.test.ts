/**
 * Integration tests: Mode B brief queue consumer idempotency.
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

describe("Mode B consumer idempotency", () => {
  let adminUserId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await seedAdmin();
    adminUserId = admin.userId;
    await putSeedAssets();
  }, 60_000);

  it("runs workflow once and acks on happy path", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "QUEUED", runId });

    env.MOCK_LLM_RESPONSES = serializeMockResponses(case001Responses());
    const { message, ack, retry } = trackedMessage({
      caseId,
      runId,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
    const ctx = createExecutionContext();
    await handleBriefQueue(makeTestBatch([message]), getTestBindings(), ctx);
    await waitOnExecutionContext(ctx);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("READY_FOR_REVIEW");
    const signalCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM signals WHERE case_id = ? AND run_id = ?",
    )
      .bind(caseId, runId)
      .first<{ count: number }>();
    expect(signalCount?.count).toBe(3);
  }, 60_000);

  it("acks duplicate delivery without re-running workflow", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "QUEUED", runId });

    env.MOCK_LLM_RESPONSES = serializeMockResponses(case001Responses());
    const first = trackedMessage({
      caseId,
      runId,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
    const ctx1 = createExecutionContext();
    await handleBriefQueue(makeTestBatch([first.message]), getTestBindings(), ctx1);
    await waitOnExecutionContext(ctx1);

    const signalCountBefore = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM signals WHERE case_id = ? AND run_id = ?",
    )
      .bind(caseId, runId)
      .first<{ count: number }>();

    const second = trackedMessage({
      caseId,
      runId,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
    const ctx2 = createExecutionContext();
    await handleBriefQueue(makeTestBatch([second.message]), getTestBindings(), ctx2);
    await waitOnExecutionContext(ctx2);

    expect(second.ack).toHaveBeenCalledTimes(1);
    const signalCountAfter = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM signals WHERE case_id = ? AND run_id = ?",
    )
      .bind(caseId, runId)
      .first<{ count: number }>();
    expect(signalCountAfter?.count).toBe(signalCountBefore?.count);
  }, 60_000);

  it("reverts to QUEUED and retries when workflow throws, then succeeds on redelivery", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "QUEUED", runId });

    env.MOCK_LLM_RESPONSES = "{ invalid json";
    const fail = trackedMessage({
      caseId,
      runId,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
    const failCtx = createExecutionContext();
    await handleBriefQueue(makeTestBatch([fail.message]), getTestBindings(), failCtx);
    await waitOnExecutionContext(failCtx);
    expect(fail.retry).toHaveBeenCalledTimes(1);

    const midRow = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(midRow?.status).toBe("QUEUED");

    env.MOCK_LLM_RESPONSES = serializeMockResponses(case001Responses());
    const ok = trackedMessage({
      caseId,
      runId,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
    const okCtx = createExecutionContext();
    await handleBriefQueue(makeTestBatch([ok.message]), getTestBindings(), okCtx);
    await waitOnExecutionContext(okCtx);
    expect(ok.ack).toHaveBeenCalledTimes(1);
    const finalRow = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(finalRow?.status).toBe("READY_FOR_REVIEW");
  }, 60_000);

  it("acks malformed messages without mutating the case row", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    const { message, ack } = trackedMessage({ caseId, enqueuedAt: Date.now() });
    const ctx = createExecutionContext();
    await handleBriefQueue(makeTestBatch([message]), getTestBindings(), ctx);
    await waitOnExecutionContext(ctx);
    expect(ack).toHaveBeenCalledTimes(1);
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("DRAFT");
  });

  it("acks a valid message for a missing case row without retry", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const { message, ack, retry } = trackedMessage({
      caseId,
      runId,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
    const ctx = createExecutionContext();
    await handleBriefQueue(makeTestBatch([message]), getTestBindings(), ctx);
    await waitOnExecutionContext(ctx);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    const row = await env.DB.prepare("SELECT id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ id: string }>();
    expect(row).toBeNull();
  });

  it("reclaims a stuck RUNNING row on redelivery (attempts > 1) and finishes the workflow", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "RUNNING", runId });

    env.MOCK_LLM_RESPONSES = serializeMockResponses(case001Responses());
    const { message, ack, retry } = trackedMessage(
      {
        caseId,
        runId,
        enqueuedAt: Date.now(),
        requestedBy: adminUserId,
      },
      { attempts: 2 },
    );
    const ctx = createExecutionContext();
    await handleBriefQueue(makeTestBatch([message]), getTestBindings(), ctx);
    await waitOnExecutionContext(ctx);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("READY_FOR_REVIEW");
  }, 60_000);

  it("acks a concurrent first-delivery duplicate against a RUNNING row (attempts = 1) without re-running", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertDraftCase(caseId, adminUserId);
    await seedCaseStatus({ caseId, status: "RUNNING", runId });

    const { message, ack, retry } = trackedMessage({
      caseId,
      runId,
      enqueuedAt: Date.now(),
      requestedBy: adminUserId,
    });
    const ctx = createExecutionContext();
    await handleBriefQueue(makeTestBatch([message]), getTestBindings(), ctx);
    await waitOnExecutionContext(ctx);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("RUNNING");
  });
});

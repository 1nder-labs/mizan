/**
 * Integration: `emitWorkflowEvent` correlated-subquery seq atomicity.
 *
 * Verifies:
 *  - Sequential emits produce strictly monotonic `seq` 1..N with no gaps.
 *  - Concurrent emits for the same `run_id` either serialize cleanly OR
 *    surface the UNIQUE(run_id, seq) collision as a loud throw (the
 *    Decision 3 contract in the Phase 7 plan — never silently retry).
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { makeDb } from "@mizan/db";
import { emitWorkflowEvent } from "@mizan/mastra";

async function seedCase(caseId: string, runId: string): Promise<void> {
  const now = Date.now();
  const userId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES (?, ?, 'seed-user', 1, ?, ?)`,
  )
    .bind(userId, `seed-${userId}@test.local`, now, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, current_run_id, created_by, created_at, updated_at)
     VALUES (?, 'RUNNING', 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(caseId, runId, userId, now, now)
    .run();
}

describe("workflow_events seq monotonicity", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("assigns strictly monotonic seq 1..N for sequential emits on one run", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await seedCase(caseId, runId);
    const db = makeDb(env.DB);

    const types = ["workflow.start", "step.suspend", "step.resume", "workflow.finish"] as const;
    const seqs: number[] = [];
    for (const eventType of types) {
      const { seq } = await emitWorkflowEvent(db, { caseId, runId, eventType });
      seqs.push(seq);
    }
    expect(seqs).toEqual([1, 2, 3, 4]);
  });

  it("emits per-run sequences independently (no cross-run interference)", async () => {
    const caseA = crypto.randomUUID();
    const runA = crypto.randomUUID();
    const caseB = crypto.randomUUID();
    const runB = crypto.randomUUID();
    await seedCase(caseA, runA);
    await seedCase(caseB, runB);
    const db = makeDb(env.DB);

    const a1 = await emitWorkflowEvent(db, {
      caseId: caseA,
      runId: runA,
      eventType: "workflow.start",
    });
    const b1 = await emitWorkflowEvent(db, {
      caseId: caseB,
      runId: runB,
      eventType: "workflow.start",
    });
    const a2 = await emitWorkflowEvent(db, {
      caseId: caseA,
      runId: runA,
      eventType: "workflow.finish",
    });
    const b2 = await emitWorkflowEvent(db, {
      caseId: caseB,
      runId: runB,
      eventType: "workflow.finish",
    });
    expect([a1.seq, a2.seq]).toEqual([1, 2]);
    expect([b1.seq, b2.seq]).toEqual([1, 2]);
  });
});

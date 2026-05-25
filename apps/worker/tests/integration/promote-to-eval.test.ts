/**
 * Integration: `promoteToEval` step idempotency on (run_id, action_id).
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const ACTION_ID = "550e8400-e29b-41d4-a716-446655440010";

async function seedRow(caseId: string, runId: string, userId: string): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES (?, ?, 'p2e-user', 1, ?, ?)`,
  )
    .bind(userId, `p2e-${userId}@test.local`, now, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, current_run_id, created_by, created_at, updated_at)
     VALUES (?, 'ACTIONED', 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(caseId, runId, userId, now, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO reviewer_actions (id, case_id, run_id, reviewer_id, action, rationale, action_id, acted_at)
     VALUES (?, ?, ?, ?, 'APPROVE', 'looks good', ?, ?)`,
  )
    .bind(crypto.randomUUID(), caseId, runId, userId, ACTION_ID, now)
    .run();
}

async function insertPromotion(caseId: string, runId: string, actionId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO eval_promotions (id, case_id, run_id, action_id, recommendation, reviewer_action, promoted_at)
     VALUES (?, ?, ?, ?, 'READY_FOR_REVIEW', 'APPROVE', ?)
     ON CONFLICT(run_id, action_id) DO NOTHING`,
  )
    .bind(crypto.randomUUID(), caseId, runId, actionId, Date.now())
    .run();
}

describe("eval_promotions (run_id, action_id) idempotency", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("INSERT ... ON CONFLICT DO NOTHING leaves exactly one row on replay", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    await seedRow(caseId, runId, userId);

    await insertPromotion(caseId, runId, ACTION_ID);
    await insertPromotion(caseId, runId, ACTION_ID);

    const rows = await env.DB.prepare(
      "SELECT id, recommendation, reviewer_action FROM eval_promotions WHERE run_id = ? AND action_id = ?",
    )
      .bind(runId, ACTION_ID)
      .all<{ id: string; recommendation: string; reviewer_action: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]?.recommendation).toBe("READY_FOR_REVIEW");
    expect(rows.results[0]?.reviewer_action).toBe("APPROVE");
  });

  it("treats distinct action_id on same run as distinct rows", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const actionA = crypto.randomUUID();
    const actionB = crypto.randomUUID();
    await seedRow(caseId, runId, userId);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO reviewer_actions (id, case_id, run_id, reviewer_id, action, rationale, action_id, acted_at)
       VALUES (?, ?, ?, ?, 'APPROVE', 'r1', ?, ?), (?, ?, ?, ?, 'ESCALATE', 'r2', ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        caseId,
        runId,
        userId,
        actionA,
        now,
        crypto.randomUUID(),
        caseId,
        runId,
        userId,
        actionB,
        now,
      )
      .run();

    await insertPromotion(caseId, runId, actionA);
    await insertPromotion(caseId, runId, actionB);

    const rows = await env.DB.prepare("SELECT action_id FROM eval_promotions WHERE run_id = ?")
      .bind(runId)
      .all<{ action_id: string }>();
    expect(rows.results.map((r) => r.action_id).sort()).toEqual([actionA, actionB].sort());
  });
});

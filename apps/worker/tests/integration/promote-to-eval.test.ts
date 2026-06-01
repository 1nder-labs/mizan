/**
 * Integration: `promoteEvalRow` helper — exercises the actual insert
 * path the step delegates to (not raw SQL), so a regression in the
 * step's `onConflictDoNothing` target or column wiring would surface
 * here.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { makeDb } from "@mizan/db";
import { promoteEvalRow } from "@mizan/mastra";

async function seedRow(
  caseId: string,
  runId: string,
  userId: string,
  actionId: string,
): Promise<string> {
  const now = Date.now();
  const orgId = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)`)
    .bind(orgId, "P2E Test Org", `org-${orgId}`)
    .run();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
     VALUES (?, ?, 'p2e-user', 1, ?, ?)`,
  )
    .bind(userId, `p2e-${userId}@test.local`, now, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, current_run_id, created_by, organization_id, created_at, updated_at)
     VALUES (?, 'ACTIONED', 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?, ?)`,
  )
    .bind(caseId, runId, userId, orgId, now, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO reviewer_actions (id, case_id, run_id, reviewer_id, action, rationale, action_id, organization_id, acted_at)
     VALUES (?, ?, ?, ?, 'APPROVE', 'looks good', ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), caseId, runId, userId, actionId, orgId, now)
    .run();
  return orgId;
}

describe("promoteEvalRow", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("inserts the eval_promotions row + is idempotent on replay", async () => {
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const actionId = crypto.randomUUID();
    await seedRow(caseId, runId, userId, actionId);
    const db = makeDb(env.DB);

    const input = {
      caseId,
      runId,
      actionId,
      recommendation: "READY_FOR_REVIEW" as const,
      reviewerAction: "APPROVE" as const,
    };
    await promoteEvalRow(db, input);
    await promoteEvalRow(db, input);

    const rows = await env.DB.prepare(
      "SELECT id, recommendation, reviewer_action FROM eval_promotions WHERE run_id = ? AND action_id = ?",
    )
      .bind(runId, actionId)
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
    const orgId = await seedRow(caseId, runId, userId, actionA);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO reviewer_actions (id, case_id, run_id, reviewer_id, action, rationale, action_id, organization_id, acted_at)
       VALUES (?, ?, ?, ?, 'ESCALATE', 'r2', ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), caseId, runId, userId, actionB, orgId, now)
      .run();
    const db = makeDb(env.DB);

    await promoteEvalRow(db, {
      caseId,
      runId,
      actionId: actionA,
      recommendation: "READY_FOR_REVIEW",
      reviewerAction: "APPROVE",
    });
    await promoteEvalRow(db, {
      caseId,
      runId,
      actionId: actionB,
      recommendation: "ESCALATE",
      reviewerAction: "ESCALATE",
    });

    const rows = await env.DB.prepare("SELECT action_id FROM eval_promotions WHERE run_id = ?")
      .bind(runId)
      .all<{ action_id: string }>();
    expect(rows.results.map((r) => r.action_id).sort()).toEqual([actionA, actionB].sort());
  });
});

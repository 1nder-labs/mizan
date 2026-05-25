/**
 * Integration: Layer 4 action_id idempotency — KV write-through cache + case-scoping.
 *
 * The route handler reads the cache directly via `readCachedActionResponse`
 * (no middleware indirection). Verifies the handler short-circuits on
 * replay, that the cache key is scoped to `(userId, caseId, action_id)`
 * so a same-action_id different-case replay is NOT a cache hit, and
 * that a cache hit leaves the DB untouched (write-through ordering).
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const KV_TTL_SECONDS = 86_400;

async function seedActionCache(
  userId: string,
  caseId: string,
  actionId: string,
  body: unknown,
): Promise<void> {
  await env.KV.put(`idem:action:${userId}:${caseId}:${actionId}`, JSON.stringify(body), {
    expirationTtl: KV_TTL_SECONDS,
  });
}

const BASE = "http://localhost";

async function seedReviewer(): Promise<{ cookie: string; userId: string }> {
  const email = `idem-reviewer-${Date.now()}-${Math.random()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Idem Reviewer" }),
    }),
  );
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row?.id) throw new Error("reviewer seed failed");
  return { cookie: signIn.headers.getSetCookie().join("; "), userId: row.id };
}

async function insertSuspendedCase(caseId: string, createdBy: string): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, current_run_id, created_by, created_at, updated_at)
     VALUES (?, 'SUSPENDED_HITL', 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(caseId, crypto.randomUUID(), createdBy, now, now)
    .run();
}

describe("Layer 4 action idempotency", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("pre-seeded cache short-circuits a replay with the same action_id on the same case", async () => {
    const { cookie, userId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    const actionId = crypto.randomUUID();
    await insertSuspendedCase(caseId, userId);

    const cachedBody = {
      status: "success" as const,
      brief: null,
      action: { action: "APPROVE" as const, rationale: "", action_id: actionId },
    };
    await seedActionCache(userId, caseId, actionId, cachedBody);

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ action: "APPROVE", rationale: "", action_id: actionId }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof cachedBody;
    expect(body).toEqual(cachedBody);
  });

  it("cache hit short-circuits — no reviewer_actions row + status unchanged", async () => {
    const { cookie, userId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    const actionId = crypto.randomUUID();
    await insertSuspendedCase(caseId, userId);

    await seedActionCache(userId, caseId, actionId, {
      status: "success",
      brief: null,
      action: { action: "APPROVE", rationale: "", action_id: actionId },
    });

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ action: "APPROVE", rationale: "", action_id: actionId }),
      }),
    );
    expect(res.status).toBe(200);

    const rowCount = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM reviewer_actions WHERE action_id = ?",
    )
      .bind(actionId)
      .first<{ n: number }>();
    expect(rowCount?.n).toBe(0);

    const caseRow = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(caseRow?.status).toBe("SUSPENDED_HITL");
  });

  it("does NOT serve cached response when the same action_id is sent on a different case", async () => {
    const { cookie, userId } = await seedReviewer();
    const actionId = crypto.randomUUID();
    const cachedCase = crypto.randomUUID();
    const otherCase = crypto.randomUUID();
    await insertSuspendedCase(cachedCase, userId);
    await insertSuspendedCase(otherCase, userId);

    await seedActionCache(userId, cachedCase, actionId, {
      status: "success",
      brief: null,
      action: { action: "APPROVE", rationale: "", action_id: actionId },
    });

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${otherCase}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ action: "APPROVE", rationale: "", action_id: actionId }),
      }),
    );

    expect(res.status).not.toBe(200);
  });
});

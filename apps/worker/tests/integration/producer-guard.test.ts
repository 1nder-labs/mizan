/**
 * Integration tests for producerGuard middleware (Layer 2 idempotency).
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { Hono } from "hono";
import { beforeAll, describe, expect, it, inject } from "vitest";
import type { CloudflareBindings } from "../../src/env.ts";
import { producerGuard, type ProducerVariables } from "../../src/middleware/producer-guard.ts";

const BASE = "http://localhost";

function makeApp() {
  return new Hono<{ Bindings: CloudflareBindings; Variables: ProducerVariables }>().post(
    "/:id/brief",
    producerGuard,
    (c) => c.json({ runId: c.get("runId"), caseId: c.get("caseRow").id }),
  );
}

async function seedReviewerUser(): Promise<string> {
  const email = `producer-guard-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Producer Guard" }),
    }),
  );
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row?.id) throw new Error("reviewer user seed failed");
  return row.id;
}

async function insertCase(id: string, status: string, reviewerId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, created_at, updated_at)
     VALUES (?, ?, 'medical', 'US', 'medical', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      status,
      JSON.stringify({
        story: "test story",
        organizer_name: "Test Organizer",
        r2_keys: {
          creator_id: "case-001-creator-id.png",
          bank_statement: "case-001-bank-statement.png",
          category_doc: "case-001-medical-receipt.png",
        },
      }),
      reviewerId,
      Date.now(),
      Date.now(),
    )
    .run();
}

describe("producerGuard integration", () => {
  const app = makeApp();
  let reviewerId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    reviewerId = await seedReviewerUser();
  }, 60_000);

  it("returns 404 when case does not exist", async () => {
    const caseId = crypto.randomUUID();
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(404);
  });

  it("returns 200 and sets runId for DRAFT case", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "DRAFT", reviewerId);
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(200);
    const body: { runId?: string; caseId?: string } = await res.json();
    expect(body).toMatchObject({ caseId });
    expect(typeof body.runId).toBe("string");
  });

  it("returns 409 when case is already RUNNING", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "RUNNING", reviewerId);
    await env.DB.prepare("UPDATE cases SET current_run_id = ? WHERE id = ?")
      .bind(crypto.randomUUID(), caseId)
      .run();
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(409);
  });

  it("allows exactly one winner in a concurrent race", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "DRAFT", reviewerId);
    const [first, second] = await Promise.all([
      app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env),
      app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });
});

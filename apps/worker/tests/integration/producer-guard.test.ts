/**
 * Integration tests for producerGuard middleware (Layer 2 idempotency).
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { beforeAll, describe, expect, it, inject } from "vitest";
import type { CloudflareBindings } from "../../src/env.ts";
import { producerGuard, type ProducerVariables } from "../../src/middleware/producer-guard.ts";
import type { ViewerContext } from "@mizan/shared";

const BASE = "http://localhost";

/** Injects a synthetic viewer so producerGuard can read c.var.viewer.organizationId. */
function injectViewer(viewer: ViewerContext) {
  return createMiddleware<{ Bindings: CloudflareBindings; Variables: ProducerVariables }>(
    async (c, next) => {
      c.set("viewer", viewer);
      await next();
    },
  );
}

function makeApp(viewer?: ViewerContext) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: ProducerVariables }>();
  if (viewer) {
    app.post("/:id/brief", injectViewer(viewer), producerGuard("RUNNING"), (c) =>
      c.json({ runId: c.get("runId"), caseId: c.get("caseRow").id }),
    );
  } else {
    app.post("/:id/brief", producerGuard("RUNNING"), (c) =>
      c.json({ runId: c.get("runId"), caseId: c.get("caseRow").id }),
    );
  }
  return app;
}

async function seedReviewerUser(): Promise<{ userId: string; organizationId: string }> {
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
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("reviewer org seed failed");
  return { userId: row.id, organizationId: memberRow.organization_id };
}

async function insertCase(
  id: string,
  status: string,
  reviewerId: string,
  organizationId: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
     VALUES (?, ?, 'medical', 'US', 'medical', ?, ?, ?, ?, ?)
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
      organizationId,
      Date.now(),
      Date.now(),
    )
    .run();
}

describe("producerGuard integration", () => {
  let app: ReturnType<typeof makeApp>;
  let reviewerId = "";
  let reviewerOrgId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const seeded = await seedReviewerUser();
    reviewerId = seeded.userId;
    reviewerOrgId = seeded.organizationId;
    app = makeApp({ userId: reviewerId, role: "admin", organizationId: reviewerOrgId });
  }, 60_000);

  it("returns 404 when case does not exist", async () => {
    const caseId = crypto.randomUUID();
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(404);
  });

  it("returns 200 and sets runId for DRAFT case", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "DRAFT", reviewerId, reviewerOrgId);
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(200);
    const body: { runId?: string; caseId?: string } = await res.json();
    expect(body).toMatchObject({ caseId });
    expect(typeof body.runId).toBe("string");
  });

  it("returns 409 when case is already RUNNING", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "RUNNING", reviewerId, reviewerOrgId);
    await env.DB.prepare("UPDATE cases SET current_run_id = ? WHERE id = ?")
      .bind(crypto.randomUUID(), caseId)
      .run();
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(409);
  });

  it("returns 200 and grants a fresh runId when retrying a FAILED case", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "FAILED", reviewerId, reviewerOrgId);
    const previousRunId = crypto.randomUUID();
    await env.DB.prepare("UPDATE cases SET current_run_id = ? WHERE id = ?")
      .bind(previousRunId, caseId)
      .run();
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(200);
    const body: { runId?: string; caseId?: string } = await res.json();
    expect(body).toMatchObject({ caseId });
    expect(typeof body.runId).toBe("string");
    expect(body.runId).not.toBe(previousRunId);
    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("RUNNING");
    expect(row?.current_run_id).toBe(body.runId);
  });

  it("allows exactly one winner in a concurrent race", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "DRAFT", reviewerId, reviewerOrgId);
    const [first, second] = await Promise.all([
      app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env),
      app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("target QUEUED on DRAFT case returns 200 and sets status QUEUED", async () => {
    const viewer = { userId: reviewerId, role: "admin" as const, organizationId: reviewerOrgId };
    const queuedApp = new Hono<{
      Bindings: CloudflareBindings;
      Variables: ProducerVariables;
    }>().post("/:id/brief", injectViewer(viewer), producerGuard("QUEUED"), (c) =>
      c.json({ runId: c.get("runId"), status: c.get("caseRow").status }),
    );
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "DRAFT", reviewerId, reviewerOrgId);
    const res = await queuedApp.fetch(
      new Request(`${BASE}/${caseId}/brief`, { method: "POST" }),
      env,
    );
    expect(res.status).toBe(200);
    const body: { runId?: string; status?: string } = await res.json();
    expect(body.status).toBe("QUEUED");
    const row = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(row?.status).toBe("QUEUED");
  });

  it("target QUEUED on RUNNING case returns 202 replay", async () => {
    const viewer = { userId: reviewerId, role: "admin" as const, organizationId: reviewerOrgId };
    const queuedApp = new Hono<{
      Bindings: CloudflareBindings;
      Variables: ProducerVariables;
    }>().post("/:id/brief", injectViewer(viewer), producerGuard("QUEUED"), (c) =>
      c.json({ ok: true }),
    );
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "RUNNING", reviewerId, reviewerOrgId);
    const inFlightRunId = crypto.randomUUID();
    await env.DB.prepare("UPDATE cases SET current_run_id = ? WHERE id = ?")
      .bind(inFlightRunId, caseId)
      .run();
    const res = await queuedApp.fetch(
      new Request(`${BASE}/${caseId}/brief`, { method: "POST" }),
      env,
    );
    expect(res.status).toBe(202);
    const body: { status?: string; run_id?: string; replay?: boolean } = await res.json();
    expect(body).toEqual({ status: "RUNNING", run_id: inFlightRunId, replay: true });
  });

  it("409 body for target RUNNING on in-flight case does not leak the existing runId", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "RUNNING", reviewerId, reviewerOrgId);
    await env.DB.prepare("UPDATE cases SET current_run_id = ? WHERE id = ?")
      .bind(crypto.randomUUID(), caseId)
      .run();
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(409);
    const body: Record<string, unknown> = await res.json();
    expect(body).not.toHaveProperty("runId");
    expect(body).not.toHaveProperty("run_id");
  });
});

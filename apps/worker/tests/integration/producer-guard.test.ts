/**
 * Integration tests for briefProducerGuard middleware (Layer 2 idempotency).
 *
 * Mounts `briefProducerGuard` on a minimal Hono app with a JSON terminal handler
 * so assertions target the guard's decisions directly — not the SSE response that
 * the real route returns. The enqueue + 200-SSE end-to-end is covered in
 * mode-b-enqueue.test.ts.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { beforeAll, describe, expect, it, inject } from "vitest";
import type { CloudflareBindings } from "../../src/env.ts";
import { briefProducerGuard, type ProducerVariables } from "../../src/middleware/producer-guard.ts";
import type { ViewerContext } from "@mizan/shared";

const BASE = "http://localhost";

/** Injects a synthetic viewer so briefProducerGuard can read c.var.viewer. */
function injectViewer(viewer: ViewerContext) {
  return createMiddleware<{ Bindings: CloudflareBindings; Variables: ProducerVariables }>(
    async (c, next) => {
      c.set("viewer", viewer);
      await next();
    },
  );
}

function makeApp(viewer: ViewerContext) {
  return new Hono<{ Bindings: CloudflareBindings; Variables: ProducerVariables }>().post(
    "/:id/brief",
    injectViewer(viewer),
    briefProducerGuard,
    (c) =>
      c.json({
        runId: c.get("runId"),
        replay: c.get("replay"),
        status: c.get("caseRow").status,
        currentRunId: c.get("caseRow").current_run_id,
      }),
  );
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
      }),
      reviewerId,
      organizationId,
      Date.now(),
      Date.now(),
    )
    .run();
}

describe("briefProducerGuard integration", () => {
  let reviewerId = "";
  let reviewerOrgId = "";
  let app: ReturnType<typeof makeApp>;

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

  it("returns 404 when viewer org does not match case org (cross-org)", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "DRAFT", reviewerId, reviewerOrgId);
    const crossOrgApp = makeApp({
      userId: reviewerId,
      role: "admin",
      organizationId: "different-org-id",
    });
    const res = await crossOrgApp.fetch(
      new Request(`${BASE}/${caseId}/brief`, { method: "POST" }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("DRAFT → claims to QUEUED, sets replay=false, fresh runId", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "DRAFT", reviewerId, reviewerOrgId);
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runId: string;
      replay: boolean;
      status: string;
      currentRunId: string | null;
    };
    expect(body.replay).toBe(false);
    expect(typeof body.runId).toBe("string");
    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("QUEUED");
    expect(row?.current_run_id).toBe(body.runId);
  });

  it("FAILED → claims to QUEUED with a fresh runId (not the stale one)", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "FAILED", reviewerId, reviewerOrgId);
    const staleRunId = crypto.randomUUID();
    await env.DB.prepare("UPDATE cases SET current_run_id = ? WHERE id = ?")
      .bind(staleRunId, caseId)
      .run();
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: string; replay: boolean };
    expect(body.replay).toBe(false);
    expect(typeof body.runId).toBe("string");
    expect(body.runId).not.toBe(staleRunId);
    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("QUEUED");
    expect(row?.current_run_id).toBe(body.runId);
  });

  it("QUEUED in-flight → replay=true, reuses existing runId, row unchanged", async () => {
    const caseId = crypto.randomUUID();
    const existingRunId = crypto.randomUUID();
    await insertCase(caseId, "QUEUED", reviewerId, reviewerOrgId);
    await env.DB.prepare("UPDATE cases SET current_run_id = ? WHERE id = ?")
      .bind(existingRunId, caseId)
      .run();
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: string; replay: boolean };
    expect(body.replay).toBe(true);
    expect(body.runId).toBe(existingRunId);
    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("QUEUED");
    expect(row?.current_run_id).toBe(existingRunId);
  });

  it("RUNNING in-flight → replay=true, reuses existing runId, row unchanged", async () => {
    const caseId = crypto.randomUUID();
    const existingRunId = crypto.randomUUID();
    await insertCase(caseId, "RUNNING", reviewerId, reviewerOrgId);
    await env.DB.prepare("UPDATE cases SET current_run_id = ? WHERE id = ?")
      .bind(existingRunId, caseId)
      .run();
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: string; replay: boolean };
    expect(body.replay).toBe(true);
    expect(body.runId).toBe(existingRunId);
    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("RUNNING");
    expect(row?.current_run_id).toBe(existingRunId);
  });

  it("SUSPENDED_HITL → 409 invalid_source_status", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "SUSPENDED_HITL", reviewerId, reviewerOrgId);
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; current_status: string };
    expect(body.error).toBe("invalid_source_status");
    expect(body.current_status).toBe("SUSPENDED_HITL");
  });

  it("ACTIONED → 409 invalid_source_status", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "ACTIONED", reviewerId, reviewerOrgId);
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; current_status: string };
    expect(body.error).toBe("invalid_source_status");
    expect(body.current_status).toBe("ACTIONED");
  });

  it("race-lost → 409 when QUEUED/RUNNING row has null current_run_id", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "QUEUED", reviewerId, reviewerOrgId);
    const res = await app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("case status race lost");
  });

  it("exactly one concurrent POST on a DRAFT case claims; statuses are subset of {200, 409}", async () => {
    const caseId = crypto.randomUUID();
    await insertCase(caseId, "DRAFT", reviewerId, reviewerOrgId);
    const [first, second] = await Promise.all([
      app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env),
      app.fetch(new Request(`${BASE}/${caseId}/brief`, { method: "POST" }), env),
    ]);
    const statuses = [first.status, second.status].sort();
    const validOutcomes = new Set([200, 409]);
    expect(validOutcomes.has(statuses[0] ?? 0)).toBe(true);
    expect(validOutcomes.has(statuses[1] ?? 0)).toBe(true);
    expect(statuses.filter((s) => s === 200).length).toBe(1);
    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string }>();
    expect(row?.status).toBe("QUEUED");
    expect(typeof row?.current_run_id).toBe("string");
  });
});

/**
 * Integration: fetch-time assignment scoping on the org SSE stream. Drives
 * `fetchEventsAfterSeq` directly (no session/stream consumption) so the SQL
 * authorization join is asserted deterministically: a non-admin reviewer on the
 * org topic sees `authorized = 1` only for events whose case is assigned to them;
 * an admin sees everything; `user:` topics are never scoped.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { makeDb } from "@mizan/db";
import type { ViewerContext } from "@mizan/shared";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { fetchEventsAfterSeq } from "../../src/routes/events-stream.ts";
import { seedReviewer } from "./cases-test-helpers.ts";

const ORG = "events-fetch-org";

async function insertUser(id: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
     VALUES (?, 'U', ?, 0, ?, ?) ON CONFLICT(id) DO NOTHING`,
  )
    .bind(id, `${id}@test.local`, Date.now(), Date.now())
    .run();
}

async function insertCase(id: string, orgId: string, createdBy: string, assignedTo: string | null) {
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json,
       current_run_id, created_by, organization_id, created_at, updated_at, assigned_to)
     VALUES (?, 'SUSPENDED_HITL', 'medical', 'US', NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
  )
    .bind(id, createdBy, orgId, Date.now(), Date.now(), assignedTo)
    .run();
}

async function insertEvent(topic: string, seq: number, orgId: string, caseId: string | null) {
  const payload =
    caseId === null
      ? JSON.stringify({
          event_type: "notification.new",
          notification_id: crypto.randomUUID(),
          user_id: "u",
        })
      : JSON.stringify({
          event_type: "case.actioned",
          case_id: caseId,
          action: "APPROVE",
          reviewer_id: "r",
        });
  const eventType = caseId === null ? "notification.new" : "case.actioned";
  await env.DB.prepare(
    `INSERT INTO live_events (id, topic, seq, event_type, payload_json, organization_id, actor_user_id, emitted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
  )
    .bind(crypto.randomUUID(), topic, seq, eventType, payload, orgId, Date.now())
    .run();
}

describe("events-stream fetch-time assignment scoping", () => {
  const db = makeDb(env.DB);
  const orgId = `${ORG}-${Date.now()}`;
  let reviewerId = "";
  let otherId = "";
  const assignedCaseId = crypto.randomUUID();
  const otherCaseId = crypto.randomUUID();

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewer = await seedReviewer();
    reviewerId = reviewer.userId;
    otherId = crypto.randomUUID();
    await insertUser(otherId);
    await env.DB.prepare(
      `INSERT INTO organizations (id, name, slug, created_at) VALUES (?, 'Org', ?, ?) ON CONFLICT(id) DO NOTHING`,
    )
      .bind(orgId, orgId, Date.now())
      .run();
    await insertCase(assignedCaseId, orgId, reviewerId, reviewerId);
    await insertCase(otherCaseId, orgId, reviewerId, otherId);
    await insertEvent(`org:${orgId}`, 1, orgId, assignedCaseId);
    await insertEvent(`org:${orgId}`, 2, orgId, otherCaseId);
    await insertEvent(`user:${reviewerId}`, 3, orgId, null);
  }, 60_000);

  function viewer(role: ViewerContext["role"]): ViewerContext {
    return { userId: reviewerId, role, organizationId: orgId };
  }

  it("a reviewer on the org topic is authorized ONLY for their assigned case's events", async () => {
    const rows = await fetchEventsAfterSeq(db, viewer("reviewer"), `org:${orgId}`, 0);
    const bySeq = new Map(rows.map((r) => [r.seq, r.authorized]));
    expect(bySeq.get(1)).toBe(1);
    expect(bySeq.get(2)).toBe(0);
    expect(rows.length).toBe(2);
  });

  it("an admin on the org topic is authorized for every case's events", async () => {
    const rows = await fetchEventsAfterSeq(db, viewer("admin"), `org:${orgId}`, 0);
    expect(rows.every((r) => r.authorized === 1)).toBe(true);
    expect(rows.length).toBe(2);
  });

  it("never scopes a user: topic — a non-case notification stays authorized for a reviewer", async () => {
    const rows = await fetchEventsAfterSeq(db, viewer("reviewer"), `user:${reviewerId}`, 0);
    expect(rows.length).toBe(1);
    expect(rows[0]?.authorized).toBe(1);
  });

  it("returns unauthorized rows too, so the cursor advances past dropped events", async () => {
    const rows = await fetchEventsAfterSeq(db, viewer("reviewer"), `org:${orgId}`, 0);
    const maxSeq = Math.max(...rows.map((r) => r.seq));
    expect(maxSeq).toBe(2);
  });
});

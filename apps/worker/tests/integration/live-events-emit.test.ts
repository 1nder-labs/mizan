/**
 * Integration: live_events rows emitted by assignment and QUEUED producer claims.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";

const BASE = "http://localhost";

function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

async function seedUser(): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `live-emit-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Live Emit User" }),
    }),
  );
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(signIn.status).toBe(200);
  const userRow = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!userRow?.id) throw new Error("user seed failed");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM member WHERE user_id = ? LIMIT 1",
  )
    .bind(userRow.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("member seed failed");
  return {
    cookie: cookiesFrom(signIn),
    userId: userRow.id,
    organizationId: memberRow.organization_id,
  };
}

async function insertDraftCase(
  caseId: string,
  createdBy: string,
  organizationId: string,
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (
       id, status, category, geography, claimed_zakat_category, brief_partial_json,
       created_by, organization_id, created_at, updated_at
     ) VALUES (?, 'DRAFT', 'humanitarian', 'US', NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(caseId, createdBy, organizationId, now, now)
    .run();
}

interface LiveEventRow {
  topic: string;
  event_type: string;
  organization_id: string | null;
}

async function loadLiveEvents(topic: string, eventType: string): Promise<LiveEventRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT topic, event_type, organization_id FROM live_events WHERE topic = ? AND event_type = ? ORDER BY seq",
  )
    .bind(topic, eventType)
    .all<LiveEventRow>();
  return results ?? [];
}

describe("live event emission", () => {
  let cookie = "";
  let userId = "";
  let organizationId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const seeded = await seedUser();
    cookie = seeded.cookie;
    userId = seeded.userId;
    organizationId = seeded.organizationId;
  }, 60_000);

  it("assignment emits case.assigned on org and user topics", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, userId, organizationId);

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/assign`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId }),
      }),
    );
    expect(res.status).toBe(200);

    const orgTopic = `org:${organizationId}`;
    const userTopic = `user:${userId}`;
    const orgEvents = await loadLiveEvents(orgTopic, "case.assigned");
    const userEvents = await loadLiveEvents(userTopic, "case.assigned");
    expect(orgEvents.length).toBeGreaterThanOrEqual(1);
    expect(userEvents.length).toBeGreaterThanOrEqual(1);
    expect(orgEvents[0]?.organization_id).toBe(organizationId);
    expect(userEvents[0]?.topic).toBe(userTopic);
  });

  it("QUEUED producer claim emits case.status_changed on org topic", async () => {
    const caseId = crypto.randomUUID();
    await insertDraftCase(caseId, userId, organizationId);

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Accept: "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
      }),
    );
    expect(res.status).toBe(202);

    const orgTopic = `org:${organizationId}`;
    const events = await loadLiveEvents(orgTopic, "case.status_changed");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.topic).toBe(orgTopic);
    expect(events[0]?.organization_id).toBe(organizationId);
  });
});

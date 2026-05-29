/**
 * Integration: org-topic authorization on GET /api/events/stream.
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

async function seedUser(): Promise<{ cookie: string; organizationId: string }> {
  const email = `events-stream-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Events Stream User" }),
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
  return { cookie: cookiesFrom(signIn), organizationId: memberRow.organization_id };
}

async function insertLiveEvent(topic: string, organizationId: string): Promise<void> {
  const payload = JSON.stringify({
    event_type: "audit.new",
    case_id: crypto.randomUUID(),
    action_id: crypto.randomUUID(),
    reviewer_id: crypto.randomUUID(),
  });
  await env.DB.prepare(
    `INSERT INTO live_events (id, topic, seq, event_type, payload_json, organization_id, actor_user_id, emitted_at)
     VALUES (?, ?, 1, 'audit.new', ?, ?, NULL, ?)`,
  )
    .bind(crypto.randomUUID(), topic, payload, organizationId, Date.now())
    .run();
}

describe("GET /api/events/stream auth", () => {
  let cookie = "";
  let organizationId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const seeded = await seedUser();
    cookie = seeded.cookie;
    organizationId = seeded.organizationId;
  }, 60_000);

  it("returns 403 for a topic outside the viewer org", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/events/stream?topic=org:other-org-id`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "forbidden" });
  });

  it("returns 200 for the viewer matching org topic", async () => {
    const topic = `org:${organizationId}`;
    await insertLiveEvent(topic, organizationId);

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/events/stream?topic=${encodeURIComponent(topic)}`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});

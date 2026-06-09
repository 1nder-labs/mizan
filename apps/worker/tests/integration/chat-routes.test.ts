/**
 * Integration: chat thread CRUD, ownership gates, and schema-drift responses.
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

async function seedUser(
  label: string,
): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `${label}-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: label }),
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
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
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

async function createThread(cookie: string): Promise<string> {
  const res = await exports.default.fetch(
    new Request(`${BASE}/api/chat/threads`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test thread" }),
    }),
  );
  expect(res.status).toBe(201);
  const body = await res.json<{ id: string }>();
  return body.id;
}

describe("chat routes", () => {
  let ownerCookie = "";
  let otherCookie = "";
  let threadId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const owner = await seedUser("chat-owner");
    const other = await seedUser("chat-other");
    ownerCookie = owner.cookie;
    otherCookie = other.cookie;
    threadId = await createThread(ownerCookie);
  }, 60_000);

  it("lists threads for the owner with cursor pagination shape", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/chat/threads?limit=50`, {
        headers: { Cookie: ownerCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ threads: { id: string }[]; nextCursor: number | null }>();
    expect(body.threads.some((row) => row.id === threadId)).toBe(true);
    expect(body.nextCursor === null || typeof body.nextCursor === "number").toBe(true);
  });

  it("loads an owned thread with messages array", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/chat/threads/${threadId}`, {
        headers: { Cookie: ownerCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ threadId: string; messages: unknown[] }>();
    expect(body.threadId).toBe(threadId);
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it("returns 403 when another user loads the thread", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/chat/threads/${threadId}`, {
        headers: { Cookie: otherCookie },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns thread_schema_drift when parts_json is invalid", async () => {
    const messageId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO chat_messages (id, thread_id, role, parts_json, created_at)
       VALUES (?, ?, 'user', ?, ?)`,
    )
      .bind(messageId, threadId, JSON.stringify("not-an-array"), Date.now())
      .run();

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/chat/threads/${threadId}`, {
        headers: { Cookie: ownerCookie },
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: string; threadId: string }>();
    expect(body.error).toBe("thread_schema_drift");
    expect(body.threadId).toBe(threadId);
  });

  it("returns 403 when posting chat to another user's thread", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/chat`, {
        method: "POST",
        headers: { Cookie: otherCookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] }],
          context: { route: "/queue", caseId: null },
        }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

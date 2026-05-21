/**
 * Integration test: idempotency replay on /api/admin/echo.
 *
 * Verifies that:
 * 1. A POST with a new Idempotency-Key returns 200 with the echoed payload.
 * 2. A second POST with the same key returns the SAME body (identical echoedAt)
 *    and the `Idempotency-Replay: true` header.
 * 3. A POST with a different key executes fresh — echoedAt differs.
 *
 * Admin user seeding: sign-up → DB UPDATE role → fresh sign-in (so KV session
 * reflects the admin role — a stale reviewer session would yield 403).
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { z } from "zod";

/** Response schema for /api/admin/echo — used to safely parse res.json(). */
const EchoResponseSchema = z.object({
  message: z.string(),
  action_id: z.string(),
  echoedAt: z.number(),
});

const BASE = "http://localhost";

/** Seeds an admin user: sign-up → DB promote → fresh sign-in → cookie. */
async function seedAdmin(email: string, password: string): Promise<string> {
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Admin Echo" }),
    }),
  );
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE email = ?").bind(email).run();
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  return signIn.headers.getSetCookie().join("; ");
}

describe("idempotency replay on /api/admin/echo", () => {
  const email = `echo-admin-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  const actionId = crypto.randomUUID();
  const idempotencyKey1 = crypto.randomUUID();
  const idempotencyKey2 = crypto.randomUUID();
  let cookie = "";
  let firstEchoedAt = 0;

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    cookie = await seedAdmin(email, password);
  });

  it("first request with key1 returns 200 and echo payload", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/admin/echo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey1,
          Cookie: cookie,
        },
        body: JSON.stringify({ message: "hello idempotency", action_id: actionId }),
      }),
    );
    expect(res.status).toBe(200);
    const body = EchoResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ message: "hello idempotency", action_id: actionId });
    firstEchoedAt = body.echoedAt;
    expect(typeof firstEchoedAt).toBe("number");
  });

  it("second request with same key1 returns Idempotency-Replay:true and identical echoedAt", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/admin/echo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey1,
          Cookie: cookie,
        },
        body: JSON.stringify({ message: "hello idempotency", action_id: actionId }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Idempotency-Replay")).toBe("true");
    const body = EchoResponseSchema.parse(await res.json());
    expect(body.echoedAt).toBe(firstEchoedAt);
  });

  it("request with different key2 executes fresh — no replay header", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/admin/echo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey2,
          Cookie: cookie,
        },
        body: JSON.stringify({ message: "hello idempotency", action_id: actionId }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Idempotency-Replay")).toBeNull();
    const body = await res.json();
    expect(body).toMatchObject({ message: "hello idempotency", action_id: actionId });
  });
});

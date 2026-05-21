/**
 * Integration test: role-gating on /api/admin/* routes.
 *
 * Verifies that:
 * 1. A reviewer cannot access admin routes (403).
 * 2. After a direct DB promotion to "admin" + fresh sign-in, the new session
 *    cookie grants access (200).
 *
 * Note: better-auth stores the session role in KV at sign-in time and only
 * re-reads from DB on the next sign-in. A DB-only role change is NOT reflected
 * in an existing session. The test therefore signs in again after the DB update
 * to obtain a cookie that reflects the new role.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const BASE = "http://localhost";

/** Signs up + signs in and returns the session cookie string. */
async function seedAndSignIn(email: string, password: string): Promise<string> {
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Role Test" }),
    }),
  );
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  return signIn.headers.getSetCookie().join("; ");
}

describe("role gating", () => {
  const email = `reviewer-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  let reviewerCookie = "";
  let adminCookie = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    reviewerCookie = await seedAndSignIn(email, password);
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE email = ?").bind(email).run();
    adminCookie = await seedAndSignIn(email, password);
  });

  it("reviewer cannot access /api/admin/ping (403)", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/admin/ping`, {
        headers: { Cookie: reviewerCookie },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("after DB promotion to admin + fresh sign-in, /api/admin/ping returns 200", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/admin/ping`, {
        headers: { Cookie: adminCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

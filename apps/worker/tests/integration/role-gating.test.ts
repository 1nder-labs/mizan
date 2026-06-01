/**
 * Integration test: role-gating on /api/admin/* routes.
 *
 * Verifies that:
 * 1. A reviewer cannot access admin routes (403).
 * 2. After a direct DB promotion to admin on the `member` row, access is granted (200).
 *
 * Org-scoped roles are resolved from the `member` table on each request.
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
  expect(signIn.status).toBe(200);
  return signIn.headers.getSetCookie().join("; ");
}

async function setMemberRole(email: string, role: "reviewer" | "admin"): Promise<void> {
  await env.DB.prepare(
    `UPDATE members
     SET role = ?
     WHERE user_id = (SELECT id FROM users WHERE email = ?)`,
  )
    .bind(role, email)
    .run();
}

describe("role gating", () => {
  const email = `reviewer-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  let sessionCookie = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    sessionCookie = await seedAndSignIn(email, password);
    await setMemberRole(email, "reviewer");
  }, 60_000);

  it("reviewer cannot access /api/admin/ping (403)", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/admin/ping`, {
        headers: { Cookie: sessionCookie },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("after member promotion to admin, /api/admin/ping returns 200", async () => {
    await setMemberRole(email, "admin");
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/admin/ping`, {
        headers: { Cookie: sessionCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

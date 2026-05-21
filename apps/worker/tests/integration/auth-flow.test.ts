/**
 * Integration test: full sign-up → sign-in → /api/me → sign-out flow.
 *
 * Runs against live Miniflare D1 + KV bindings via `exports.default.fetch`.
 * Migrations are applied in `beforeAll` using the array loaded by
 * `tests/setup/migrations.ts` and shared via `inject("migrations")`.
 *
 * A unique email is generated per test run using `Date.now()` so the suite
 * is idempotent across re-runs within the same Miniflare session.
 *
 * `autoSignIn: false` is set in the auth config, so sign-up returns 200 with
 * user data but does NOT set a session cookie. A separate sign-in call is
 * required to obtain the session cookie.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";

const BASE = "http://localhost";

/** Extracts Set-Cookie values from a response and joins them for request replay. */
function getCookies(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

describe("auth flow", () => {
  const email = `user-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  let sessionCookie = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  });

  it("sign-up returns 200 (no session cookie — autoSignIn: false)", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: "Test User" }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("sign-in returns 200 and sets a session cookie", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(res.status).toBe(200);
    sessionCookie = getCookies(res);
    expect(sessionCookie).not.toBe("");
  });

  it("GET /api/me returns 200 with user identity and reviewer role", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/me`, {
        headers: { Cookie: sessionCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      user: {
        email,
        role: "reviewer",
        id: expect.any(String),
      },
    });
  });

  it("sign-out returns 200", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          Origin: BASE,
        },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("GET /api/me returns 401 after sign-out", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/me`, {
        headers: { Cookie: sessionCookie },
      }),
    );
    expect(res.status).toBe(401);
  });
});

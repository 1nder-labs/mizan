/**
 * Unit tests for the `requireRole` middleware factory.
 *
 * The middleware reads `c.var.auth.api.getSession` (set by `authInit`).
 * A tiny Hono app is assembled with a "fake-auth" pre-middleware that injects
 * a controlled `auth` variable, followed by `requireRole`. This keeps the
 * test hermetic — no D1/KV bindings required.
 *
 * The `fakeAuthMiddleware` uses an untyped `c.set` call (allowed in test
 * files via the `.oxlintrc.json` `no-explicit-any` override) to avoid
 * requiring an `as` cast that would violate `consistent-type-assertions`.
 *
 * Test structure:
 * - No session    → 401 JSON `{ error: "Unauthorized" }`
 * - Wrong role    → 403 JSON `{ error: "Forbidden" }`
 * - Correct role  → 200 + `c.var.user` set with `{ id, role }`
 * - Array form    → passes when user role matches any allowed role
 */

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireRole, type Role, type RoleVariables } from "../../src/middleware/require-role.ts";

/** Minimal session shape returned by `auth.api.getSession`. */
interface FakeSession {
  user: { id: string; role: string };
}

/** Mutable control surface shared across test cases. */
const getSessionMock = vi.fn<() => Promise<FakeSession | null>>();

/** Fake `auth` object — structurally matches the `api.getSession` surface used by `requireRole`. */
const fakeAuth = {
  api: { getSession: getSessionMock },
};

/**
 * Pre-middleware that injects `fakeAuth` into `c.var.auth` before `requireRole`
 * runs. Using an untyped `c.set("auth", ...)` here avoids an `as` cast —
 * `no-explicit-any` is permitted in test files so the generic escape is safe.
 */
const fakeAuthMiddleware = createMiddleware(async (c, next) => {
  // any is permitted in test files; avoids an `as` cast on the full auth type
  (c as any).set("auth", fakeAuth);
  await next();
});

/** Tiny Hono app: fake-auth pre-middleware → requireRole(role) → probe handler. */
function makeApp(role: Role) {
  return new Hono<{ Variables: RoleVariables }>()
    .use("*", fakeAuthMiddleware)
    .use("*", requireRole(role))
    .get("/probe", (c) => c.json({ user: c.get("user") }));
}

describe("requireRole middleware", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  it("returns 401 when no session exists", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const app = makeApp("admin");
    const res = await app.fetch(new Request("http://localhost/probe"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when the session role does not match the required role", async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: "user-1", role: "reviewer" },
    });
    const app = makeApp("admin");
    const res = await app.fetch(new Request("http://localhost/probe"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("calls next and sets c.var.user when the role matches", async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: "user-2", role: "admin" },
    });
    const app = makeApp("admin");
    const res = await app.fetch(new Request("http://localhost/probe"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ user: { id: "user-2", role: "admin" } });
  });

  it("accepts array of allowed roles — passes when user has one of them", async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: "user-3", role: "reviewer" },
    });
    const app = new Hono<{ Variables: RoleVariables }>()
      .use("*", fakeAuthMiddleware)
      .use("*", requireRole(["reviewer", "admin"]))
      .get("/probe", (c) => c.json({ ok: true }));
    const res = await app.fetch(new Request("http://localhost/probe"));
    expect(res.status).toBe(200);
  });
});

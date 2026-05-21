/**
 * Unit tests for the `requireRole` middleware factory.
 *
 * The middleware reads `c.var.auth.api.getSession` (set by `authInit`).
 * A tiny Hono app is assembled with a "fake-auth" pre-middleware that injects
 * a controlled `auth` variable, followed by `requireRole`. This keeps the
 * test hermetic — no D1/KV bindings required.
 *
 * `fakeAuthMiddleware` is typed with its own `Variables` generic where `auth`
 * is typed as `typeof fakeAuth`. Hono erases middleware generics at composition
 * time, so `c.set("auth", fakeAuth)` type-checks against the middleware's local
 * Variables without needing any cast on the app-level type.
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
import { requireRole, type RoleVariables } from "../../src/middleware/require-role.ts";
import type { Role } from "../../src/middleware/role-utils.ts";

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
 * runs. Typed with its own Variables generic so `c.set("auth", fakeAuth)`
 * type-checks against `typeof fakeAuth` without any cast. Hono erases the
 * middleware generic at composition time — the app-level type is unaffected.
 */
const fakeAuthMiddleware = createMiddleware<{ Variables: { auth: typeof fakeAuth } }>(
  async (c, next) => {
    c.set("auth", fakeAuth);
    await next();
  },
);

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

  it("defaults unrecognized role to 'reviewer' (safe-minimum-privilege)", async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: "user-4", role: "superadmin-not-yet-defined" },
    });
    const reviewerApp = makeApp("reviewer");
    const res = await reviewerApp.fetch(new Request("http://localhost/probe"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ user: { id: "user-4", role: "reviewer" } });
  });

  it("denies an admin route when role string is unrecognized (falls back to reviewer)", async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: "user-5", role: "ghost" },
    });
    const adminApp = makeApp("admin");
    const res = await adminApp.fetch(new Request("http://localhost/probe"));
    expect(res.status).toBe(403);
  });
});

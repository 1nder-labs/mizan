/**
 * Unit tests for the `requireRole` middleware factory.
 *
 * Org-scoped role resolution requires D1 membership rows; full role-gate
 * coverage lives in integration tests. These cases cover the early exits, so
 * `resolveActiveOrgId` is mocked to a pure session read (no D1) — matching its
 * real early-return when the session already carries (or lacks) an active org.
 * Mocking it also isolates this file from the process-global `@mizan/db` mock
 * other unit tests install, which would otherwise leak into the backfill query.
 */

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ViewerVariables } from "../../src/middleware/require-role.ts";
import type { Role } from "../../src/middleware/role-utils.ts";

interface FakeSession {
  user: { id: string };
  session: { id: string; userId: string; activeOrganizationId?: string | null };
}

mock.module("../../src/auth/active-org.ts", () => ({
  resolveActiveOrgId: (
    _env: unknown,
    _auth: unknown,
    _headers: Headers,
    session: FakeSession,
  ): Promise<string | null> => Promise.resolve(session.session.activeOrganizationId ?? null),
}));

const { requireRole } = await import("../../src/middleware/require-role.ts");

const getSessionMock = mock(() => Promise.resolve(null as FakeSession | null));

const fakeAuth = {
  api: { getSession: getSessionMock },
};

const fakeAuthMiddleware = createMiddleware<{ Variables: { auth: typeof fakeAuth } }>(
  async (c, next) => {
    c.set("auth", fakeAuth);
    await next();
  },
);

function makeApp(role: Role) {
  return new Hono<{ Variables: ViewerVariables }>()
    .use("*", fakeAuthMiddleware)
    .use("*", requireRole(role))
    .get("/probe", (c) => c.json({ viewer: c.var.viewer }));
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
    expect(body).toEqual({ error: "unauthorized" });
  });

  it("returns 403 when the session has no active organization", async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: "user-1" },
      session: { id: "sess-1", userId: "user-1" },
    });
    const app = makeApp("admin");
    const res = await app.fetch(new Request("http://localhost/probe"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "no_active_org_membership" });
  });
});

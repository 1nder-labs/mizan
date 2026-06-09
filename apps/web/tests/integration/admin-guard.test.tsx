/**
 * Integration: `requireAdmin` redirect for non-admin sessions.
 */
import { describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";

const { getSessionMock, meGetMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  meGetMock: vi.fn(),
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({ getSession: getSessionMock }),
}));

vi.mock("@/lib/rpc.ts", () => ({
  api: { me: { $get: meGetMock } },
  apiMutate: {},
  createApi: () => ({}),
  createApiMutate: () => ({}),
}));

import { requireAdmin } from "../../src/lib/auth-client.ts";

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("requireAdmin loader gate", () => {
  test("admin session resolves to the me payload", async () => {
    getSessionMock.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
    meGetMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: "u1", email: "admin@test", role: "admin", activeOrganizationId: "org-1" },
      }),
    });
    const qc = makeClient();
    const me = await requireAdmin(qc);
    expect(me.user.role).toBe("admin");
  });

  test("reviewer session throws redirect to /queue", async () => {
    getSessionMock.mockResolvedValueOnce({ data: { user: { id: "u2" } }, error: null });
    meGetMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: "u2", email: "rev@test", role: "reviewer", activeOrganizationId: "org-1" },
      }),
    });
    const qc = makeClient();
    let thrown: unknown;
    try {
      await requireAdmin(qc);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBeDefined();
    expect(isRedirect(thrown)).toBe(true);
  });

  test("logged-out (null session) throws redirect to /login", async () => {
    getSessionMock.mockResolvedValueOnce({ data: null, error: null });
    const qc = makeClient();
    let thrown: unknown;
    try {
      await requireAdmin(qc);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBeDefined();
    expect(isRedirect(thrown)).toBe(true);
  });
});

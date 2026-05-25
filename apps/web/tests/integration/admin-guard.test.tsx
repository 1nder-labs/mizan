/**
 * Integration: `requireAdmin` redirect for non-admin sessions.
 *
 * `requireAdmin` is the loader gate for `/admin/audit`. A reviewer
 * session must throw a redirect to `/queue`; an admin session must
 * resolve to the session payload so the loader continues.
 */
import { describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({ getSession: getSessionMock }),
}));

import { requireAdmin } from "../../src/lib/auth-client.ts";

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

interface SessionShape {
  readonly user: { readonly role: "reviewer" | "admin" };
}

function sessionPayload(role: "reviewer" | "admin"): { data: SessionShape; error: null } {
  return { data: { user: { role } }, error: null };
}

describe("requireAdmin loader gate", () => {
  test("admin session resolves to the session payload", async () => {
    getSessionMock.mockResolvedValueOnce(sessionPayload("admin"));
    const qc = makeClient();
    const session = await requireAdmin(qc);
    expect(session.user.role).toBe("admin");
  });

  test("reviewer session throws redirect to /queue", async () => {
    getSessionMock.mockResolvedValueOnce(sessionPayload("reviewer"));
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

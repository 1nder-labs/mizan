/**
 * Integration: org auto-provision on signup and invitation acceptance.
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

async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<{ cookie: string; userId: string }> {
  const res = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    }),
  );
  expect(res.status).toBe(200);
  const userRow = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!userRow?.id) throw new Error("signup user row missing");
  return { cookie: cookiesFrom(res), userId: userRow.id };
}

interface MembershipRow {
  role: string;
  organization_id: string;
  organization_name: string;
}

async function loadMembership(userId: string): Promise<MembershipRow | null> {
  return env.DB.prepare(
    `SELECT m.role, m.organization_id, o.name AS organization_name
     FROM members m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ?
     LIMIT 1`,
  )
    .bind(userId)
    .first<MembershipRow>();
}

describe("org signup hooks", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("fresh signup creates admin member and organization", async () => {
    const email = `org-fresh-${Date.now()}@test.local`;
    const password = "CorrectHorse99!!";
    const { userId } = await signUp(email, password, "Fresh Org User");

    const membership = await loadMembership(userId);
    expect(membership).not.toBeNull();
    expect(membership?.role).toBe("admin");
    expect(membership?.organization_id).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(membership?.organization_name.length).toBeGreaterThan(0);

    const orgCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM organizations o JOIN members m ON m.organization_id = o.id WHERE m.user_id = ?",
    )
      .bind(userId)
      .first<{ count: number }>();
    expect(orgCount?.count).toBe(1);
  });

  it("signup with pending invitation joins existing org as reviewer", async () => {
    const inviterEmail = `org-inviter-${Date.now()}@test.local`;
    const inviteeEmail = `org-invitee-${Date.now()}@test.local`;
    const password = "CorrectHorse99!!";

    const inviter = await signUp(inviterEmail, password, "Org Inviter");
    const inviterMembership = await loadMembership(inviter.userId);
    if (!inviterMembership) throw new Error("inviter membership missing");

    const invitationId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO invitations (id, email, inviter_id, organization_id, role, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'reviewer', 'pending', ?, ?)`,
    )
      .bind(
        invitationId,
        inviteeEmail.toLowerCase(),
        inviter.userId,
        inviterMembership.organization_id,
        now,
        now + 48 * 60 * 60 * 1000,
      )
      .run();

    const invitee = await signUp(inviteeEmail, password, "Org Invitee");
    const inviteeMembership = await loadMembership(invitee.userId);
    expect(inviteeMembership).not.toBeNull();
    expect(inviteeMembership?.role).toBe("reviewer");
    expect(inviteeMembership?.organization_id).toBe(inviterMembership.organization_id);

    const inviteeOrgCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM members WHERE user_id = ?",
    )
      .bind(invitee.userId)
      .first<{ count: number }>();
    expect(inviteeOrgCount?.count).toBe(1);

    const invitationStatus = await env.DB.prepare("SELECT status FROM invitations WHERE id = ?")
      .bind(invitationId)
      .first<{ status: string }>();
    expect(invitationStatus?.status).toBe("accepted");
  });

  it("explicit signupKind=internal still creates an own admin org", async () => {
    const email = `org-internal-${Date.now()}@test.local`;
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: "CorrectHorse99!!",
          name: "Internal Kind User",
          signupKind: "internal",
        }),
      }),
    );
    expect(res.status).toBe(200);

    const userRow = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (!userRow?.id) throw new Error("internal signup user row missing");

    const membership = await loadMembership(userRow.id);
    expect(membership?.role).toBe("admin");
    expect(membership?.organization_id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});

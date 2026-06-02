/**
 * Integration: client self-signup onboarding (U2).
 *
 * Proves the load-bearing assumption: a `signupKind: "client"` field set on
 * the sign-up request reaches `databaseHooks.user.create.after` and routes the
 * user into the single designated review org (`REVIEW_ORG_ID`) as a `client`
 * member — never their own admin org. The review org is seeded with an admin
 * member first (mirrors dev; avoids `addMember` against an owner-less org).
 *
 * Vitest + Miniflare. `REVIEW_ORG_ID` is bound to `review-org-fixture` in
 * `vitest.config.ts`. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";

const BASE = "http://localhost";
const PASSWORD = "CorrectHorse99!!";
const REVIEW_ORG_ID = "review-org-fixture";

interface MembershipRow {
  role: string;
  organization_id: string;
}

async function signUp(
  email: string,
  name: string,
  signupKind?: "client" | "internal",
): Promise<string> {
  const body = signupKind
    ? { email, password: PASSWORD, name, signupKind }
    : { email, password: PASSWORD, name };
  const res = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  expect(res.status).toBe(200);
  const userRow = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!userRow?.id) throw new Error("signup user row missing");
  return userRow.id;
}

async function seedReviewOrgWithAdmin(adminUserId: string): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(REVIEW_ORG_ID, "Mizan Review Org", "mizan-review-org", Date.now())
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO members (id, user_id, organization_id, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
  )
    .bind(crypto.randomUUID(), adminUserId, REVIEW_ORG_ID, Date.now())
    .run();
}

async function loadMemberships(userId: string): Promise<MembershipRow[]> {
  const rows = await env.DB.prepare("SELECT role, organization_id FROM members WHERE user_id = ?")
    .bind(userId)
    .all<MembershipRow>();
  return rows.results;
}

describe("client signup onboarding", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const adminId = await signUp(`review-admin-${Date.now()}@test.local`, "Review Admin");
    await seedReviewOrgWithAdmin(adminId);
  }, 60_000);

  it("routes a client signup into the review org as a client member, no own org", async () => {
    const clientId = await signUp(`client-${Date.now()}@test.local`, "Client User", "client");

    const memberships = await loadMemberships(clientId);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("client");
    expect(memberships[0]?.organization_id).toBe(REVIEW_ORG_ID);

    const ownOrgCount = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM organizations o
       JOIN members m ON m.organization_id = o.id
       WHERE m.user_id = ? AND o.id != ?`,
    )
      .bind(clientId, REVIEW_ORG_ID)
      .first<{ count: number }>();
    expect(ownOrgCount?.count).toBe(0);
  });

  it("leaves the review org's pre-existing admin membership intact", async () => {
    const adminCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM members WHERE organization_id = ? AND role = 'admin'",
    )
      .bind(REVIEW_ORG_ID)
      .first<{ count: number }>();
    expect(adminCount?.count).toBeGreaterThanOrEqual(1);
  });
});

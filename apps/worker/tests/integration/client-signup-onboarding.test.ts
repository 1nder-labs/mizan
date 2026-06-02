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
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { REVIEW_ORG_ID, seedReviewOrgWithAdmin, signUp } from "./portal-helpers.ts";

interface MembershipRow {
  role: string;
  organization_id: string;
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
    const { userId: adminId } = await signUp(
      `review-admin-${Date.now()}@test.local`,
      "Review Admin",
    );
    await seedReviewOrgWithAdmin(adminId);
  }, 60_000);

  it("routes a client signup into the review org as a client member, no own org", async () => {
    const { userId: clientId } = await signUp(
      `client-${Date.now()}@test.local`,
      "Client User",
      "client",
    );

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

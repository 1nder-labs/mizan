/**
 * Integration: native better-auth org-endpoint guard (U3b).
 *
 * The shared-review-org model makes every client a member of the one review
 * org, so better-auth's member-readable roster endpoints would let a client
 * enumerate reviewers and sibling clients. This proves:
 *   - a client is denied `/api/auth/organization/get-full-organization` (403)
 *   - admins and reviewers pass the guard untouched
 *   - the reviewer team roster (`/api/team/members`) excludes client rows (PII)
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { TeamMembersResponseSchema } from "@mizan/shared";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BASE, REVIEW_ORG_ID, seedReviewOrgWithAdmin, signUp } from "./portal-helpers.ts";

const FULL_ORG_URL = `${BASE}/api/auth/organization/get-full-organization`;

async function inviteReviewerInto(organizationId: string, inviterId: string): Promise<string> {
  const email = `nog-reviewer-${Date.now()}@test.local`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO invitations (id, email, inviter_id, organization_id, role, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'reviewer', 'pending', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      email.toLowerCase(),
      inviterId,
      organizationId,
      now,
      now + 48 * 3600 * 1000,
    )
    .run();
  return (await signUp(email, "NOG Reviewer")).cookie;
}

function getWith(url: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = cookie ? { Cookie: cookie } : {};
  return exports.default.fetch(new Request(url, { headers }));
}

describe("native org-endpoint guard", () => {
  let clientCookie = "";
  let clientEmail = "";
  let adminCookie = "";
  let reviewerCookie = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewAdmin = await signUp(`nog-admin-${Date.now()}@test.local`, "Review Admin");
    await seedReviewOrgWithAdmin(reviewAdmin.userId);

    clientEmail = `nog-clienta-${Date.now()}@test.local`.toLowerCase();
    clientCookie = (await signUp(clientEmail, "Client A", "client")).cookie;
    await signUp(`nog-clientb-${Date.now()}@test.local`, "Client B", "client");

    adminCookie = (await signUp(`nog-freshadmin-${Date.now()}@test.local`, "Fresh Admin")).cookie;
    reviewerCookie = await inviteReviewerInto(REVIEW_ORG_ID, reviewAdmin.userId);
  }, 60_000);

  it("denies a client the native get-full-organization endpoint (403)", async () => {
    const res = await getWith(FULL_ORG_URL, clientCookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("lets admins and reviewers through the guard", async () => {
    expect((await getWith(FULL_ORG_URL, adminCookie)).status).not.toBe(403);
    expect((await getWith(FULL_ORG_URL, reviewerCookie)).status).not.toBe(403);
  });

  it("excludes client members from the reviewer team roster", async () => {
    const res = await getWith(`${BASE}/api/team/members`, reviewerCookie);
    expect(res.status).toBe(200);
    const parsed = TeamMembersResponseSchema.parse(await res.json());
    expect(parsed.members.map((m) => m.email)).not.toContain(clientEmail);
  });
});

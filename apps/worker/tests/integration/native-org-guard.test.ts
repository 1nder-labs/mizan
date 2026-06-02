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

const BASE = "http://localhost";
const PW = "CorrectHorse99!!";
const REVIEW_ORG_ID = "review-org-fixture";
const FULL_ORG_URL = `${BASE}/api/auth/organization/get-full-organization`;

function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

async function signUp(
  rawEmail: string,
  name: string,
  signupKind?: "client",
): Promise<{ userId: string; cookie: string }> {
  const email = rawEmail.toLowerCase();
  const body = signupKind
    ? { email, password: PW, name, signupKind }
    : { email, password: PW, name };
  const res = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  expect(res.status).toBe(200);
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row?.id) throw new Error("signup row missing");
  return { userId: row.id, cookie: cookiesFrom(res) };
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
    expect(parsed.members.some((m) => m.role === "client")).toBe(false);
    expect(parsed.members.map((m) => m.email)).not.toContain(clientEmail);
  });
});

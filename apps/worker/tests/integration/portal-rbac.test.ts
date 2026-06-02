/**
 * Integration: client portal RBAC + ownership boundary (U3).
 *
 * The portal (`/api/portal/*`) is the isolation surface of the shared-org
 * model. This proves the deny matrix end to end:
 *   anon            → 401
 *   admin/reviewer  → 403 (non-client roles, including a reviewer who shares
 *                          the review org with clients)
 *   client (owner)  → 200, sees only their own campaign id
 *   client (other)  → 404, a sibling client's campaign is indistinguishable
 *                          from a non-existent one (no id-enumeration leak)
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { ClientCaseDetailSchema } from "@mizan/shared";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BASE, REVIEW_ORG_ID, seedReviewOrgWithAdmin, signUp } from "./portal-helpers.ts";

async function insertCampaign(createdBy: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
     VALUES (?, 'DRAFT', 'orphan', 'US', NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(id, createdBy, REVIEW_ORG_ID, Date.now(), Date.now())
    .run();
  return id;
}

async function inviteAndSignupReviewer(): Promise<string> {
  const inviter = await signUp(`p-inviter-${Date.now()}@test.local`, "Portal Inviter");
  const orgRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(inviter.userId)
    .first<{ organization_id: string }>();
  if (!orgRow) throw new Error("inviter org missing");
  const reviewerEmail = `p-reviewer-${Date.now()}@test.local`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO invitations (id, email, inviter_id, organization_id, role, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'reviewer', 'pending', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      reviewerEmail.toLowerCase(),
      inviter.userId,
      orgRow.organization_id,
      now,
      now + 48 * 60 * 60 * 1000,
    )
    .run();
  return (await signUp(reviewerEmail, "Portal Reviewer")).cookie;
}

function getCampaign(id: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = cookie ? { Cookie: cookie } : {};
  return exports.default.fetch(new Request(`${BASE}/api/portal/campaigns/${id}`, { headers }));
}

describe("portal RBAC", () => {
  let clientACookie = "";
  let clientBCookie = "";
  let adminCookie = "";
  let reviewerCookie = "";
  let clientAId = "";
  let caseA = "";
  let caseB = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewAdmin = await signUp(`p-admin-${Date.now()}@test.local`, "Review Admin");
    await seedReviewOrgWithAdmin(reviewAdmin.userId);

    const clientA = await signUp(`p-clientA-${Date.now()}@test.local`, "Client A", "client");
    const clientB = await signUp(`p-clientB-${Date.now()}@test.local`, "Client B", "client");
    clientACookie = clientA.cookie;
    clientBCookie = clientB.cookie;
    clientAId = clientA.userId;
    caseA = await insertCampaign(clientA.userId);
    caseB = await insertCampaign(clientB.userId);

    adminCookie = (await signUp(`p-freshadmin-${Date.now()}@test.local`, "Fresh Admin")).cookie;
    reviewerCookie = await inviteAndSignupReviewer();
  }, 60_000);

  it("denies anonymous callers (401)", async () => {
    expect((await getCampaign(caseA)).status).toBe(401);
  });

  it("denies admin and reviewer with a role error (not a missing-org error)", async () => {
    const a = await getCampaign(caseA, adminCookie);
    expect(a.status).toBe(403);
    expect(await a.json()).toEqual({ error: "forbidden" });
    const r = await getCampaign(caseA, reviewerCookie);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "forbidden" });
  });

  it("backfills the client's active org onto the session and reports role client", async () => {
    const me = await exports.default.fetch(
      new Request(`${BASE}/api/me`, { headers: { Cookie: clientACookie } }),
    );
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      user: { role: "client", activeOrganizationId: REVIEW_ORG_ID },
    });
    const row = await env.DB.prepare(
      "SELECT active_organization_id AS org FROM sessions WHERE user_id = ?",
    )
      .bind(clientAId)
      .first<{ org: string | null }>();
    expect(row?.org).toBe(REVIEW_ORG_ID);
  });

  it("lets a client read their own campaign (200)", async () => {
    const res = await getCampaign(caseA, clientACookie);
    expect(res.status).toBe(200);
    const detail = ClientCaseDetailSchema.parse(await res.json());
    expect(detail.id).toBe(caseA);
    expect(detail.status).toBe("submitted");
  });

  it("hides a sibling client's campaign as 404 (no existence leak)", async () => {
    expect((await getCampaign(caseB, clientACookie)).status).toBe(404);
    expect((await getCampaign(caseA, clientBCookie)).status).toBe(404);
  });
});

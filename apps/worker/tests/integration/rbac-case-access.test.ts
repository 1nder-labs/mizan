/**
 * Integration: the per-case RBAC boundary (`requireCaseAccess`).
 *
 * Locks the invariant the dogfood verified by hand and that the route-ordering
 * exemption in `routes/cases.ts` silently depends on:
 *
 * - admin → full access to any case in its org.
 * - reviewer → ONLY the cases assigned to them: assignee 200, same-org
 *   non-assignee 403 on every data route (`/:id`, `/:id/signals`).
 * - cross-org → 404 (no existence leak), even for an admin of another org.
 * - `POST /:id/assign` is EXEMPT from the gate: a non-assignee reviewer can
 *   still self-claim an unassigned case (regression guard — if a future edit
 *   moves a data route above the gate, or the assign route below it, the
 *   relevant assertion here flips).
 *
 * Two reviewers must share one ACTIVE org; the only path that sets a user's
 * active org to a shared org is invitation-acceptance on sign-up, so every
 * member is seeded through `inviteInto`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { BASE, REVIEW_ORG_ID, seedReviewOrgWithAdmin, send, signUp } from "./portal-helpers.ts";

async function inviteInto(
  orgId: string,
  inviterId: string,
  role: "admin" | "reviewer",
): Promise<{ userId: string; cookie: string }> {
  const email = `rbac-${role}-${crypto.randomUUID()}@test.local`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO invitations (id, email, inviter_id, organization_id, role, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      email.toLowerCase(),
      inviterId,
      orgId,
      role,
      now,
      now + 48 * 3600 * 1000,
    )
    .run();
  return signUp(email, `RBAC ${role}`);
}

async function insertCase(
  orgId: string,
  createdBy: string,
  assignedTo: string | null,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, assigned_to, created_by, organization_id, created_at, updated_at)
     VALUES (?, 'READY_FOR_REVIEW', 'humanitarian', 'US', NULL, NULL, ?, ?, ?, ?, ?)`,
  )
    .bind(id, assignedTo, createdBy, orgId, now, now)
    .run();
  return id;
}

describe("per-case RBAC (requireCaseAccess)", () => {
  let adminCookie = "";
  let assigneeCookie = "";
  let otherCookie = "";
  let otherUserId = "";
  let crossOrgCookie = "";
  let caseId = "";
  let unassignedCaseId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const bootstrap = await signUp(`rbac-bootstrap-${Date.now()}@test.local`, "Bootstrap");
    await seedReviewOrgWithAdmin(bootstrap.userId);

    const admin = await inviteInto(REVIEW_ORG_ID, bootstrap.userId, "admin");
    const assignee = await inviteInto(REVIEW_ORG_ID, bootstrap.userId, "reviewer");
    const other = await inviteInto(REVIEW_ORG_ID, bootstrap.userId, "reviewer");
    const crossOrg = await signUp(`rbac-cross-${Date.now()}@test.local`, "Cross Org");

    adminCookie = admin.cookie;
    assigneeCookie = assignee.cookie;
    otherCookie = other.cookie;
    otherUserId = other.userId;
    crossOrgCookie = crossOrg.cookie;

    caseId = await insertCase(REVIEW_ORG_ID, bootstrap.userId, assignee.userId);
    unassignedCaseId = await insertCase(REVIEW_ORG_ID, bootstrap.userId, null);
  }, 60_000);

  it("reviewer assigned the case → 200 on GET /:id", async () => {
    const res = await send("GET", `${BASE}/api/cases/${caseId}`, assigneeCookie);
    expect(res.status).toBe(200);
  });

  it("same-org reviewer NOT assigned → 403 on GET /:id", async () => {
    const res = await send("GET", `${BASE}/api/cases/${caseId}`, otherCookie);
    expect(res.status).toBe(403);
  });

  it("same-org reviewer NOT assigned → 403 on a sub-route (GET /:id/signals)", async () => {
    const res = await send("GET", `${BASE}/api/cases/${caseId}/signals`, otherCookie);
    expect(res.status).toBe(403);
  });

  it("admin → 200 on GET /:id even though unassigned to them", async () => {
    const res = await send("GET", `${BASE}/api/cases/${caseId}`, adminCookie);
    expect(res.status).toBe(200);
  });

  it("a viewer from another org → 404 on GET /:id (no existence leak)", async () => {
    const res = await send("GET", `${BASE}/api/cases/${caseId}`, crossOrgCookie);
    expect(res.status).toBe(404);
  });

  it("assign is EXEMPT: a non-assignee reviewer self-claims an unassigned case → 200", async () => {
    const res = await send("POST", `${BASE}/api/cases/${unassignedCaseId}/assign`, otherCookie, {
      user_id: otherUserId,
    });
    expect(res.status).toBe(200);
  });
});

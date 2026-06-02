/**
 * Integration tests: POST /api/cases/:id/assign — case assignment route.
 *
 * Covers:
 * - Auth gate: anon 401.
 * - Reviewer self-claims unassigned case → 200, body {case_id, assigned_to: reviewerId}.
 * - Reviewer tries to claim a case already assigned to someone else → 403 self_assign_only.
 * - Reviewer unassigns their own case → 200 assigned_to null.
 * - Admin assigns case to another member → 200.
 * - invalid_user 400 when assigning to a non-member id.
 * - not_found 404 for an unknown/cross-org case id.
 * - assignment_conflict 409 — two concurrent admin claims race; first wins, second gets 409.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { CaseAssignErrorBodySchema, CaseAssignResponseSchema } from "@mizan/shared";

const BASE = "http://localhost";

interface UserSeed {
  readonly cookie: string;
  readonly userId: string;
  readonly organizationId: string;
}

/** Signs up a new account (auto-provisioned as admin) and returns session cookie + ids. */
async function signUpUser(tag: string): Promise<UserSeed> {
  const email = `assign-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: `Assign ${tag}` }),
    }),
  );
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const userRow = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!userRow?.id) throw new Error(`signUpUser(${tag}): user row missing`);
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(userRow.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error(`signUpUser(${tag}): member row missing`);
  return {
    cookie: signIn.headers.getSetCookie().join("; "),
    userId: userRow.id,
    organizationId: memberRow.organization_id,
  };
}

/** Demotes the given userId to reviewer in their org. */
async function demoteToReviewer(userId: string): Promise<void> {
  await env.DB.prepare(`UPDATE members SET role = 'reviewer' WHERE user_id = ?`).bind(userId).run();
}

/**
 * Adds a user as a reviewer member of a target org.
 * Required when a second user needs to be an org member for admin-assign tests.
 */
async function addMemberToOrg(userId: string, organizationId: string): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO members (id, user_id, organization_id, role, created_at)
     VALUES (?, ?, ?, 'reviewer', ?)`,
  )
    .bind(crypto.randomUUID(), userId, organizationId, now)
    .run();
}

interface CaseOpts {
  readonly id: string;
  readonly createdBy: string;
  readonly organizationId: string;
  readonly assignedTo?: string | null;
  readonly status?: string;
}

/** Inserts a minimal case row with the required organization_id. */
async function insertCase(opts: CaseOpts): Promise<void> {
  const now = Date.now();
  const status = opts.status ?? "READY_FOR_REVIEW";
  await env.DB.prepare(
    `INSERT INTO cases
       (id, status, category, geography, claimed_zakat_category, brief_partial_json,
        assigned_to, created_by, organization_id, created_at, updated_at)
     VALUES (?, ?, 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status      = excluded.status,
       assigned_to = excluded.assigned_to,
       updated_at  = excluded.updated_at`,
  )
    .bind(opts.id, status, opts.assignedTo ?? null, opts.createdBy, opts.organizationId, now, now)
    .run();
}

function postAssign(caseId: string, cookie: string, userId: string | null): Request {
  return new Request(`${BASE}/api/cases/${caseId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ user_id: userId }),
  });
}

describe("POST /api/cases/:id/assign", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("anon request returns 401", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${crypto.randomUUID()}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: null }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("reviewer self-claims unassigned case → 200, body {case_id, assigned_to: reviewerId}", async () => {
    const reviewer = await signUpUser("reviewer-claim");
    await demoteToReviewer(reviewer.userId);
    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      createdBy: reviewer.userId,
      organizationId: reviewer.organizationId,
      assignedTo: null,
    });

    const res = await exports.default.fetch(postAssign(caseId, reviewer.cookie, reviewer.userId));
    expect(res.status).toBe(200);
    const body = CaseAssignResponseSchema.parse(await res.json());
    expect(body.case_id).toBe(caseId);
    expect(body.assigned_to).toBe(reviewer.userId);
  });

  it("reviewer tries to claim a case already assigned to someone else → 403 self_assign_only", async () => {
    const reviewer = await signUpUser("reviewer-conflict");
    await demoteToReviewer(reviewer.userId);

    const otherUser = await signUpUser("other-holder");
    await addMemberToOrg(otherUser.userId, reviewer.organizationId);

    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      createdBy: reviewer.userId,
      organizationId: reviewer.organizationId,
      assignedTo: otherUser.userId,
    });

    const res = await exports.default.fetch(postAssign(caseId, reviewer.cookie, reviewer.userId));
    expect(res.status).toBe(403);
    const body = CaseAssignErrorBodySchema.parse(await res.json());
    expect(body.error).toBe("self_assign_only");
  }, 30_000);

  it("reviewer unassigns their own case → 200 assigned_to null", async () => {
    const reviewer = await signUpUser("reviewer-unassign");
    await demoteToReviewer(reviewer.userId);
    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      createdBy: reviewer.userId,
      organizationId: reviewer.organizationId,
      assignedTo: reviewer.userId,
    });

    const res = await exports.default.fetch(postAssign(caseId, reviewer.cookie, null));
    expect(res.status).toBe(200);
    const body = CaseAssignResponseSchema.parse(await res.json());
    expect(body.case_id).toBe(caseId);
    expect(body.assigned_to).toBeNull();
  });

  it("admin assigns case to another member → 200", async () => {
    const admin = await signUpUser("admin-assign");
    const target = await signUpUser("target-member");
    await addMemberToOrg(target.userId, admin.organizationId);

    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      createdBy: admin.userId,
      organizationId: admin.organizationId,
      assignedTo: null,
    });

    const res = await exports.default.fetch(postAssign(caseId, admin.cookie, target.userId));
    expect(res.status).toBe(200);
    const body = CaseAssignResponseSchema.parse(await res.json());
    expect(body.case_id).toBe(caseId);
    expect(body.assigned_to).toBe(target.userId);
  }, 30_000);

  it("returns 400 invalid_user when assigning to a non-member id", async () => {
    const admin = await signUpUser("admin-invalid");
    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      createdBy: admin.userId,
      organizationId: admin.organizationId,
    });

    const outsiderId = crypto.randomUUID();
    const res = await exports.default.fetch(postAssign(caseId, admin.cookie, outsiderId));
    expect(res.status).toBe(400);
    const body = CaseAssignErrorBodySchema.parse(await res.json());
    expect(body.error).toBe("invalid_user");
  });

  it("returns 404 for an unknown case id", async () => {
    const admin = await signUpUser("admin-notfound");
    const unknownId = crypto.randomUUID();

    const res = await exports.default.fetch(postAssign(unknownId, admin.cookie, null));
    expect(res.status).toBe(404);
    const body = CaseAssignErrorBodySchema.parse(await res.json());
    expect(body.error).toBe("not_found");
  });

  it("returns 409 assignment_conflict when two concurrent requests race on the same case", async () => {
    const admin = await signUpUser("admin-race");
    const target = await signUpUser("target-race");
    await addMemberToOrg(target.userId, admin.organizationId);

    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      createdBy: admin.userId,
      organizationId: admin.organizationId,
      assignedTo: null,
    });

    const [r1, r2] = await Promise.all([
      exports.default.fetch(postAssign(caseId, admin.cookie, target.userId)),
      exports.default.fetch(postAssign(caseId, admin.cookie, target.userId)),
    ]);

    const statuses = [r1.status, r2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const loser = r1.status === 409 ? r1 : r2;
    const loserBody = CaseAssignErrorBodySchema.parse(await loser.json());
    expect(loserBody.error).toBe("assignment_conflict");
  }, 30_000);

  it("reviewer unassigning another member's case → 403 self_assign_only", async () => {
    const reviewer = await signUpUser("reviewer-unassign-other");
    await demoteToReviewer(reviewer.userId);
    const holder = await signUpUser("other-holder-unassign");
    await addMemberToOrg(holder.userId, reviewer.organizationId);

    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      createdBy: reviewer.userId,
      organizationId: reviewer.organizationId,
      assignedTo: holder.userId,
    });

    const res = await exports.default.fetch(postAssign(caseId, reviewer.cookie, null));
    expect(res.status).toBe(403);
    const body = CaseAssignErrorBodySchema.parse(await res.json());
    expect(body.error).toBe("self_assign_only");
  }, 30_000);

  it("reviewer assigning an unassigned case to a third party → 403 self_assign_only", async () => {
    const reviewer = await signUpUser("reviewer-assign-other");
    await demoteToReviewer(reviewer.userId);
    const third = await signUpUser("third-party-assign");
    await addMemberToOrg(third.userId, reviewer.organizationId);

    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      createdBy: reviewer.userId,
      organizationId: reviewer.organizationId,
      assignedTo: null,
    });

    const res = await exports.default.fetch(postAssign(caseId, reviewer.cookie, third.userId));
    expect(res.status).toBe(403);
    const body = CaseAssignErrorBodySchema.parse(await res.json());
    expect(body.error).toBe("self_assign_only");
  }, 30_000);
});

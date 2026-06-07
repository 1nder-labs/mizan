/**
 * Integration: case notes — three channels, visibility scoping, and the
 * action-type-guarded `clientResponded` signal (U6): it fires only when the
 * reviewer's LATEST action was REQUEST_DOCS and a newer client note exists,
 * which is why every "true" case sits on an ACTIONED row (reviewer actions are
 * terminal) — the previous status gate made this headline case impossible.
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { makeDb } from "@mizan/db";
import { CaseNotesResponseSchema } from "@mizan/shared";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { clientResponded } from "../../src/lib/case-notes.ts";
import { BASE, REVIEW_ORG_ID, seedReviewOrgWithAdmin, send, signUp } from "./portal-helpers.ts";

async function inviteReviewerInto(orgId: string, inviterId: string) {
  const email = `cn-reviewer-${Date.now()}@test.local`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO invitations (id, email, inviter_id, organization_id, role, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'reviewer', 'pending', ?, ?)`,
  )
    .bind(crypto.randomUUID(), email.toLowerCase(), inviterId, orgId, now, now + 48 * 3600 * 1000)
    .run();
  return signUp(email, "Reviewer");
}

async function insertCase(
  createdBy: string,
  orgId: string,
  status = "DRAFT",
  assignedTo: string | null = null,
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, assigned_to, created_by, organization_id, created_at, updated_at)
     VALUES (?, ?, 'orphan', 'US', NULL, NULL, ?, ?, ?, ?, ?)`,
  )
    .bind(id, status, assignedTo, createdBy, orgId, Date.now(), Date.now())
    .run();
  return id;
}

async function insertNote(opts: {
  caseId: string;
  authorUserId: string;
  authorRole: string;
  visibility: string;
  createdAt: number;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO case_notes (id, case_id, organization_id, author_user_id, author_role, visibility, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'note', ?)`,
  )
    .bind(
      crypto.randomUUID(),
      opts.caseId,
      REVIEW_ORG_ID,
      opts.authorUserId,
      opts.authorRole,
      opts.visibility,
      opts.createdAt,
    )
    .run();
}

async function insertAction(
  caseId: string,
  reviewerId: string,
  actedAt: number,
  action = "REQUEST_DOCS",
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO reviewer_actions (id, case_id, run_id, reviewer_id, action, rationale, acted_at, action_id, organization_id)
     VALUES (?, ?, ?, ?, ?, 'ok', ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      caseId,
      crypto.randomUUID(),
      reviewerId,
      action,
      actedAt,
      crypto.randomUUID(),
      REVIEW_ORG_ID,
    )
    .run();
}

describe("case notes", () => {
  let db: ReturnType<typeof makeDb>;
  let clientAId = "";
  let clientACookie = "";
  let clientBCookie = "";
  let reviewerId = "";
  let reviewerCookie = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    db = makeDb(env.DB);
    const reviewAdmin = await signUp(`cn-admin-${Date.now()}@test.local`, "Review Admin");
    await seedReviewOrgWithAdmin(reviewAdmin.userId);
    const clientA = await signUp(`cn-clienta-${Date.now()}@test.local`, "Client A", "client");
    const clientB = await signUp(`cn-clientb-${Date.now()}@test.local`, "Client B", "client");
    clientAId = clientA.userId;
    clientACookie = clientA.cookie;
    clientBCookie = clientB.cookie;
    const reviewer = await inviteReviewerInto(REVIEW_ORG_ID, reviewAdmin.userId);
    reviewerId = reviewer.userId;
    reviewerCookie = reviewer.cookie;
  }, 60_000);

  it("true: a client response newer than REQUEST_DOCS — even though the case is ACTIONED", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID, "ACTIONED");
    await insertAction(id, reviewerId, 100, "REQUEST_DOCS");
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 200,
    });
    expect(await clientResponded(db, id)).toBe(true);
  });

  it("false: no reviewer action yet — an intake upload is not a 'response'", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID);
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 100,
    });
    expect(await clientResponded(db, id)).toBe(false);
  });

  it("false: the latest action is a decision (APPROVE), not a doc request", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID, "ACTIONED");
    await insertAction(id, reviewerId, 100, "APPROVE");
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 200,
    });
    expect(await clientResponded(db, id)).toBe(false);
  });

  it("false: REQUEST_DOCS is newer than the client note", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID, "ACTIONED");
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 100,
    });
    await insertAction(id, reviewerId, 200, "REQUEST_DOCS");
    expect(await clientResponded(db, id)).toBe(false);
  });

  it("false: an exact tie uses strict greater-than", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID, "ACTIONED");
    await insertAction(id, reviewerId, 100, "REQUEST_DOCS");
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 100,
    });
    expect(await clientResponded(db, id)).toBe(false);
  });

  it("false: a reviewer's client_facing message does not count as a client response", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID, "ACTIONED");
    await insertAction(id, reviewerId, 100, "REQUEST_DOCS");
    await insertNote({
      caseId: id,
      authorUserId: reviewerId,
      authorRole: "reviewer",
      visibility: "client_facing",
      createdAt: 300,
    });
    expect(await clientResponded(db, id)).toBe(false);
  });

  it("re-brief loop: a second REQUEST_DOCS re-arms until a newer client response", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID, "ACTIONED");
    await insertAction(id, reviewerId, 100, "REQUEST_DOCS");
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 200,
    });
    expect(await clientResponded(db, id)).toBe(true);
    await insertAction(id, reviewerId, 300, "REQUEST_DOCS");
    expect(await clientResponded(db, id)).toBe(false);
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 400,
    });
    expect(await clientResponded(db, id)).toBe(true);
  });

  it("scopes note visibility: reviewer sees all, client sees only client_facing", async () => {
    const caseId = await insertCase(clientAId, REVIEW_ORG_ID, "DRAFT", reviewerId);
    expect(
      (
        await send("POST", `${BASE}/api/cases/${caseId}/notes/message`, reviewerCookie, {
          body: "Please add your bank statement.",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await send("POST", `${BASE}/api/cases/${caseId}/notes/internal`, reviewerCookie, {
          body: "Looks borderline, watch the dates.",
        })
      ).status,
    ).toBe(201);
    await insertNote({
      caseId,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: Date.now(),
    });

    const reviewerView = CaseNotesResponseSchema.parse(
      await (await send("GET", `${BASE}/api/cases/${caseId}/notes`, reviewerCookie)).json(),
    );
    expect(reviewerView.notes.length).toBe(3);
    expect(reviewerView.notes.some((n) => n.visibility === "internal")).toBe(true);

    const clientRes = await send(
      "GET",
      `${BASE}/api/portal/campaigns/${caseId}/notes`,
      clientACookie,
    );
    expect(clientRes.status).toBe(200);
    const clientView = CaseNotesResponseSchema.parse(await clientRes.json());
    expect(clientView.notes.length).toBe(2);
    expect(clientView.notes.every((n) => n.visibility === "client_facing")).toBe(true);
  });

  it("denies a reviewer noting a case in another org (404)", async () => {
    const otherAdmin = await signUp(`cn-otheradmin-${Date.now()}@test.local`, "Other Admin");
    await seedReviewOrgWithAdmin(otherAdmin.userId, "other-org-fixture");
    const otherCase = await insertCase(otherAdmin.userId, "other-org-fixture");
    const res = await send("POST", `${BASE}/api/cases/${otherCase}/notes/message`, reviewerCookie, {
      body: "should not land",
    });
    expect(res.status).toBe(404);
  });

  it("denies a client reading a sibling's notes (404)", async () => {
    const caseId = await insertCase(clientAId, REVIEW_ORG_ID);
    const res = await send("GET", `${BASE}/api/portal/campaigns/${caseId}/notes`, clientBCookie);
    expect(res.status).toBe(404);
  });
});

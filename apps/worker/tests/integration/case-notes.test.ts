/**
 * Integration: case notes — three channels + visibility scoping. The
 * `isClientResponded` rule (now a pure function of the latest reviewer action +
 * `submitted_at`) is asserted as a unit block below: it fires only on an
 * explicit re-submission strictly newer than a client-awaiting action, NEVER on
 * a conversation note — so a chat thread can never disturb the review flow.
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { CaseNotesResponseSchema } from "@mizan/shared";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { isClientResponded } from "../../src/lib/case-notes.ts";
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

describe("case notes", () => {
  let clientAId = "";
  let clientACookie = "";
  let clientBCookie = "";
  let reviewerId = "";
  let reviewerCookie = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
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

  describe("isClientResponded — explicit re-submission is the only signal", () => {
    it("true: a re-submission (submitted_at) strictly newer than REQUEST_DOCS", () => {
      expect(isClientResponded({ action: "REQUEST_DOCS", actedAtMs: 100 }, 200)).toBe(true);
    });

    it("true: a re-submission newer than an ESCALATE — escalations also await the client", () => {
      expect(isClientResponded({ action: "ESCALATE", actedAtMs: 100 }, 200)).toBe(true);
    });

    it("false: no reviewer action yet", () => {
      expect(isClientResponded(null, 200)).toBe(false);
    });

    it("false: the latest action is a decision (APPROVE), not a doc request", () => {
      expect(isClientResponded({ action: "APPROVE", actedAtMs: 100 }, 200)).toBe(false);
    });

    it("false: a BLOCK decision never awaits the client", () => {
      expect(isClientResponded({ action: "BLOCK", actedAtMs: 100 }, 200)).toBe(false);
    });

    it("false: REQUEST_DOCS is newer than the re-submission", () => {
      expect(isClientResponded({ action: "REQUEST_DOCS", actedAtMs: 200 }, 100)).toBe(false);
    });

    it("false: never re-submitted — no submitted_at", () => {
      expect(isClientResponded({ action: "REQUEST_DOCS", actedAtMs: 100 }, null)).toBe(false);
    });

    it("false: an exact tie uses strict greater-than", () => {
      expect(isClientResponded({ action: "REQUEST_DOCS", actedAtMs: 100 }, 100)).toBe(false);
    });

    it("re-brief loop: a second REQUEST_DOCS re-arms until a newer re-submission", () => {
      const firstResubmit = 200;
      expect(isClientResponded({ action: "REQUEST_DOCS", actedAtMs: 100 }, firstResubmit)).toBe(
        true,
      );
      expect(isClientResponded({ action: "REQUEST_DOCS", actedAtMs: 300 }, firstResubmit)).toBe(
        false,
      );
      expect(isClientResponded({ action: "REQUEST_DOCS", actedAtMs: 300 }, 400)).toBe(true);
    });
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

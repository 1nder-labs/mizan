/**
 * Integration: case notes — three channels, visibility scoping, and the
 * status-guarded `clientResponded` signal (U6).
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { makeDb } from "@mizan/db";
import { CaseNotesResponseSchema } from "@mizan/shared";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { clientResponded } from "../../src/lib/case-notes.ts";

const BASE = "http://localhost";
const PW = "CorrectHorse99!!";
const REVIEW_ORG_ID = "review-org-fixture";

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

async function seedReviewOrgWithAdmin(adminUserId: string, orgId = REVIEW_ORG_ID): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(orgId, `Org ${orgId}`, orgId, Date.now())
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO members (id, user_id, organization_id, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
  )
    .bind(crypto.randomUUID(), adminUserId, orgId, Date.now())
    .run();
}

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

async function insertCase(createdBy: string, orgId: string, status = "DRAFT"): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
     VALUES (?, ?, 'orphan', 'US', NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(id, status, createdBy, orgId, Date.now(), Date.now())
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

async function insertAction(caseId: string, reviewerId: string, actedAt: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO reviewer_actions (id, case_id, run_id, reviewer_id, action, rationale, acted_at, action_id, organization_id)
     VALUES (?, ?, ?, ?, 'APPROVE', 'ok', ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      caseId,
      crypto.randomUUID(),
      reviewerId,
      actedAt,
      crypto.randomUUID(),
      REVIEW_ORG_ID,
    )
    .run();
}

function send(method: string, url: string, cookie: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Cookie: cookie };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return exports.default.fetch(
    new Request(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
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

  it("clientResponded true: client note on a brand-new case (no action, epoch-0)", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID);
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 100,
    });
    expect(await clientResponded(db, id)).toBe(true);
  });

  it("clientResponded true: client note newer than the latest action", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID);
    await insertAction(id, reviewerId, 100);
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 200,
    });
    expect(await clientResponded(db, id)).toBe(true);
  });

  it("clientResponded false: action newer than the client note", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID);
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 100,
    });
    await insertAction(id, reviewerId, 200);
    expect(await clientResponded(db, id)).toBe(false);
  });

  it("clientResponded false: exact tie uses strict greater-than", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID);
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 100,
    });
    await insertAction(id, reviewerId, 100);
    expect(await clientResponded(db, id)).toBe(false);
  });

  it("clientResponded false: a reviewer client_facing message is not a client response", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID);
    await insertNote({
      caseId: id,
      authorUserId: reviewerId,
      authorRole: "reviewer",
      visibility: "client_facing",
      createdAt: 300,
    });
    expect(await clientResponded(db, id)).toBe(false);
  });

  it("clientResponded false: terminal case regardless of note recency", async () => {
    const id = await insertCase(clientAId, REVIEW_ORG_ID, "ACTIONED");
    await insertNote({
      caseId: id,
      authorUserId: clientAId,
      authorRole: "client",
      visibility: "client_facing",
      createdAt: 999,
    });
    expect(await clientResponded(db, id)).toBe(false);
  });

  it("scopes note visibility: reviewer sees all, client sees only client_facing", async () => {
    const caseId = await insertCase(clientAId, REVIEW_ORG_ID);
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

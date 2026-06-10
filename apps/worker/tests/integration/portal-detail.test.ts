/**
 * Integration: client campaign list + detail (U7).
 *
 * Proves: the detail response parses the strict `ClientCaseDetailSchema` and
 * carries no brief internals; needs_evidence surfaces the drafted organizer
 * ask; the list is created_by-self scoped (excludes sibling campaigns); a
 * sibling's campaign detail is 404.
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import {
  CampaignMutationResponseSchema,
  ClientCampaignsResponseSchema,
  ClientCaseDetailSchema,
  type ClientCaseDetail,
} from "@mizan/shared";
import { beforeAll, describe, expect, it, inject } from "vitest";
import {
  BASE,
  REVIEW_ORG_ID,
  seedReviewOrgWithAdmin,
  signUp,
  submitCampaign,
} from "./portal-helpers.ts";

const CAMPAIGNS_URL = `${BASE}/api/portal/campaigns`;

const VALID_BODY = {
  title: "Clean-water wells initiative",
  story: "Funding clean-water wells across three rural districts.",
  organizer_name: "Ahmad Hassan",
  category: "food_security",
  geography: "KE",
};

async function createCampaign(cookie: string): Promise<string> {
  const res = await exports.default.fetch(
    new Request(CAMPAIGNS_URL, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    }),
  );
  expect(res.status).toBe(201);
  const id = CampaignMutationResponseSchema.parse(await res.json()).id;
  await submitCampaign(id, cookie);
  return id;
}

function getJson(url: string, cookie: string): Promise<Response> {
  return exports.default.fetch(new Request(url, { headers: { Cookie: cookie } }));
}

async function insertRequestDocs(caseId: string, reviewerId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO reviewer_actions (id, case_id, run_id, reviewer_id, action, rationale, acted_at, action_id, organization_id)
     VALUES (?, ?, ?, ?, 'REQUEST_DOCS', 'need docs', ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      caseId,
      crypto.randomUUID(),
      reviewerId,
      Date.now(),
      crypto.randomUUID(),
      REVIEW_ORG_ID,
    )
    .run();
  const payload = JSON.stringify({
    recommendation: "REQUEST_DOCS",
    verification_path: "documentary",
    geography_tier: "SAFE",
    policy_grounded: true,
    missing_docs: [{ docType: "bank_statement", reason: "need a recent statement" }],
    reviewer_questions: [],
    extracted_claims: "claims",
    confidence: 80,
    policy_citations: [],
    drafted_organizer_message: {
      message: "Please upload your recent bank statement.",
      missing_items: ["bank_statement"],
    },
  });
  await env.DB.prepare(
    `INSERT INTO briefs (id, case_id, run_id, recommendation, confidence, composed_at, payload_json, organization_id)
     VALUES (?, ?, ?, 'REQUEST_DOCS', 80, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), caseId, crypto.randomUUID(), Date.now(), payload, REVIEW_ORG_ID)
    .run();
}

describe("portal campaign list + detail", () => {
  let clientACookie = "";
  let clientBCookie = "";
  let reviewerId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewAdmin = await signUp(`pd-admin-${Date.now()}@test.local`, "Review Admin");
    await seedReviewOrgWithAdmin(reviewAdmin.userId);
    reviewerId = reviewAdmin.userId;
    clientACookie = (await signUp(`pd-clienta-${Date.now()}@test.local`, "Client A", "client"))
      .cookie;
    clientBCookie = (await signUp(`pd-clientb-${Date.now()}@test.local`, "Client B", "client"))
      .cookie;
  }, 60_000);

  it("detail parses the strict schema and exposes no brief internals", async () => {
    const id = await createCampaign(clientACookie);
    const res = await getJson(`${CAMPAIGNS_URL}/${id}`, clientACookie);
    expect(res.status).toBe(200);
    /** Strict parse throws on any extra (internal) key — this IS the no-leak guard. */
    const detail = ClientCaseDetailSchema.parse(await res.json());
    expect(detail.id).toBe(id);
    expect(detail.status).toBe("submitted");
    expect(detail.story).toBe(VALID_BODY.story);
    expect(detail.evidence).toHaveLength(3);
    expect(detail.organizerAsk).toBeNull();
  });

  it("needs_evidence surfaces the drafted organizer ask", async () => {
    const id = await createCampaign(clientACookie);
    await insertRequestDocs(id, reviewerId);
    const res = await getJson(`${CAMPAIGNS_URL}/${id}`, clientACookie);
    expect(res.status).toBe(200);
    const detail: ClientCaseDetail = ClientCaseDetailSchema.parse(await res.json());
    expect(detail.status).toBe("needs_evidence");
    expect(detail.organizerAsk).toEqual({
      message: "Please upload your recent bank statement.",
      missingItems: ["bank_statement"],
    });
  });

  it("a plain conversation note never flips the case off needs_evidence", async () => {
    const id = await createCampaign(clientACookie);
    await insertRequestDocs(id, reviewerId);
    const noteRes = await exports.default.fetch(
      new Request(`${CAMPAIGNS_URL}/${id}/notes`, {
        method: "POST",
        headers: { Cookie: clientACookie, "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Thanks, I am gathering the statement." }),
      }),
    );
    expect(noteRes.status).toBe(201);
    const detail = ClientCaseDetailSchema.parse(
      await (await getJson(`${CAMPAIGNS_URL}/${id}`, clientACookie)).json(),
    );
    expect(detail.status).toBe("needs_evidence");
    expect(detail.organizerAsk).not.toBeNull();
    expect(detail.canResubmit).toBe(false);
  });

  it("re-submit without a new document is rejected (server-gated on fresh evidence)", async () => {
    const id = await createCampaign(clientACookie);
    await insertRequestDocs(id, reviewerId);
    await env.DB.prepare(`UPDATE cases SET submitted_at = ? WHERE id = ?`).bind(1000, id).run();
    await env.DB.prepare(`UPDATE reviewer_actions SET acted_at = ? WHERE case_id = ?`)
      .bind(2000, id)
      .run();
    const res = await exports.default.fetch(
      new Request(`${CAMPAIGNS_URL}/${id}/submit`, {
        method: "POST",
        headers: { Cookie: clientACookie },
      }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "resubmit_not_allowed" });
    const detail = ClientCaseDetailSchema.parse(
      await (await getJson(`${CAMPAIGNS_URL}/${id}`, clientACookie)).json(),
    );
    expect(detail.status).toBe("needs_evidence");
    expect(detail.canResubmit).toBe(false);
  });

  it("an explicit re-submit after a NEW document hands the case back to the reviewer", async () => {
    const id = await createCampaign(clientACookie);
    await insertRequestDocs(id, reviewerId);
    /** Explicit ordering: submit(1000) < request(2000) < new doc(3000) → re-submit is valid. */
    await env.DB.prepare(`UPDATE cases SET submitted_at = ? WHERE id = ?`).bind(1000, id).run();
    await env.DB.prepare(`UPDATE reviewer_actions SET acted_at = ? WHERE case_id = ?`)
      .bind(2000, id)
      .run();
    await env.DB.prepare(
      `INSERT INTO documents (id, case_id, doc_kind, r2_key, filename, content_type, uploaded_at, organization_id)
       VALUES (?, ?, 'creator_id', ?, 'id.pdf', 'application/pdf', ?, ?)`,
    )
      .bind(crypto.randomUUID(), id, `evidence/${id}/creator_id`, 3000, REVIEW_ORG_ID)
      .run();
    const before = ClientCaseDetailSchema.parse(
      await (await getJson(`${CAMPAIGNS_URL}/${id}`, clientACookie)).json(),
    );
    expect(before.status).toBe("needs_evidence");
    expect(before.canResubmit).toBe(true);
    await submitCampaign(id, clientACookie);
    const after = ClientCaseDetailSchema.parse(
      await (await getJson(`${CAMPAIGNS_URL}/${id}`, clientACookie)).json(),
    );
    expect(after.status).toBe("under_review");
    expect(after.organizerAsk).toBeNull();
  });

  it("lists only the viewer's own campaigns", async () => {
    const ownerCookie = (await signUp(`pd-owner-${Date.now()}@test.local`, "Owner", "client"))
      .cookie;
    const otherCookie = (await signUp(`pd-other-${Date.now()}@test.local`, "Other", "client"))
      .cookie;
    const mine = [await createCampaign(ownerCookie), await createCampaign(ownerCookie)];
    const theirs = await createCampaign(otherCookie);

    const res = await getJson(CAMPAIGNS_URL, ownerCookie);
    expect(res.status).toBe(200);
    const { campaigns } = ClientCampaignsResponseSchema.parse(await res.json());
    const ids = campaigns.map((c) => c.id);
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(expect.arrayContaining(mine));
    expect(ids).not.toContain(theirs);
  });

  it("returns 404 for a sibling's campaign detail", async () => {
    const id = await createCampaign(clientACookie);
    const res = await getJson(`${CAMPAIGNS_URL}/${id}`, clientBCookie);
    expect(res.status).toBe(404);
  });
});

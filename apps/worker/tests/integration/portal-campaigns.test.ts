/**
 * Integration: client campaign intake — create + edit (U4).
 *
 * Proves: create lands a DRAFT case in the review org owned by the client with
 * a valid overlay (no r2_keys — evidence lives in the `documents` table); create
 * validates required fields; edit re-submits intake while preserving uploaded
 * evidence (documents rows survive); the edit is gated atomically on
 * status='DRAFT' (409 once a reviewer has moved the case on); a client cannot
 * edit a sibling's campaign (404).
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { CampaignMutationResponseSchema, CaseOverlaySchema } from "@mizan/shared";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BASE, REVIEW_ORG_ID, seedReviewOrgWithAdmin, send, signUp } from "./portal-helpers.ts";

const CAMPAIGNS_URL = `${BASE}/api/portal/campaigns`;

const VALID_BODY = {
  title: "Clean-water wells initiative",
  story: "We are raising funds to build clean-water wells in rural villages.",
  organizer_name: "Ahmad Hassan",
  category: "food_security",
  geography: "KE",
  claimed_zakat_category: "fi_sabilillah",
  vouching_narrative: "Vouched for by the local masjid committee.",
};

function caseRow(id: string) {
  return env.DB.prepare(
    "SELECT status, category, geography, claimed_zakat_category, created_by, organization_id, title, brief_partial_json FROM cases WHERE id = ?",
  )
    .bind(id)
    .first<{
      status: string;
      category: string;
      claimed_zakat_category: string | null;
      created_by: string;
      organization_id: string;
      title: string;
      brief_partial_json: string;
    }>();
}

/** Returns the most-recent documents row for a (case, docKind) pair, or null. */
async function latestDocRow(caseId: string, docKind: string): Promise<{ r2_key: string } | null> {
  return env.DB.prepare(
    "SELECT r2_key FROM documents WHERE case_id = ? AND doc_kind = ? ORDER BY uploaded_at DESC LIMIT 1",
  )
    .bind(caseId, docKind)
    .first<{ r2_key: string }>();
}

/** Seeds a documents row for a given slot (simulates a prior upload). */
async function seedDocRow(
  caseId: string,
  organizationId: string,
  docKind: string,
  r2Key: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO documents (id, case_id, doc_kind, r2_key, filename, content_type, uploaded_at, organization_id)
     VALUES (?, ?, ?, ?, '', 'image/png', ?, ?) ON CONFLICT(id) DO NOTHING`,
  )
    .bind(`${caseId}-${docKind}`, caseId, docKind, r2Key, Date.now(), organizationId)
    .run();
}

async function createCampaign(cookie: string): Promise<string> {
  const res = await send("POST", CAMPAIGNS_URL, cookie, VALID_BODY);
  expect(res.status).toBe(201);
  return CampaignMutationResponseSchema.parse(await res.json()).id;
}

describe("portal campaigns", () => {
  let clientACookie = "";
  let clientBCookie = "";
  let clientAId = "";
  let reviewAdminId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewAdmin = await signUp(`pc-admin-${Date.now()}@test.local`, "Review Admin");
    reviewAdminId = reviewAdmin.userId;
    await seedReviewOrgWithAdmin(reviewAdmin.userId);
    const clientA = await signUp(`pc-clienta-${Date.now()}@test.local`, "Client A", "client");
    const clientB = await signUp(`pc-clientb-${Date.now()}@test.local`, "Client B", "client");
    clientACookie = clientA.cookie;
    clientAId = clientA.userId;
    clientBCookie = clientB.cookie;
  }, 60_000);

  it("creates a DRAFT campaign owned by the client with a valid overlay and no documents rows", async () => {
    const res = await send("POST", CAMPAIGNS_URL, clientACookie, VALID_BODY);
    expect(res.status).toBe(201);
    const created = CampaignMutationResponseSchema.parse(await res.json());
    expect(created.status).toBe("DRAFT");

    const row = await caseRow(created.id);
    expect(row?.status).toBe("DRAFT");
    expect(row?.organization_id).toBe(REVIEW_ORG_ID);
    expect(row?.created_by).toBe(clientAId);
    expect(row?.title).toBe(VALID_BODY.title);
    expect(row?.category).toBe(VALID_BODY.category);
    expect(row?.claimed_zakat_category).toBe(VALID_BODY.claimed_zakat_category);

    const overlay = CaseOverlaySchema.parse(JSON.parse(row?.brief_partial_json ?? "null"));
    expect(overlay.story).toBe(VALID_BODY.story);
    expect(overlay.organizer_name).toBe(VALID_BODY.organizer_name);
    expect(overlay.vouching_narrative).toBe(VALID_BODY.vouching_narrative);

    expect(await latestDocRow(created.id, "creator_id")).toBeNull();
    expect(await latestDocRow(created.id, "bank_statement")).toBeNull();
    expect(await latestDocRow(created.id, "category_doc")).toBeNull();
  });

  it("rejects a create missing a required field (400)", async () => {
    const res = await send("POST", CAMPAIGNS_URL, clientACookie, {
      organizer_name: "No Story",
      category: "food_security",
      geography: "KE",
    });
    expect(res.status).toBe(400);
  });

  it("edits a DRAFT campaign and preserves already-uploaded evidence documents rows", async () => {
    const id = await createCampaign(clientACookie);
    await seedDocRow(id, REVIEW_ORG_ID, "creator_id", `${id}/creator_id/uuid-abc`);
    await seedDocRow(id, REVIEW_ORG_ID, "bank_statement", `${id}/bank_statement/uuid-def`);

    const res = await send("PATCH", `${CAMPAIGNS_URL}/${id}`, clientACookie, {
      ...VALID_BODY,
      story: "Updated: wells now planned across three districts.",
    });
    expect(res.status).toBe(200);

    const row = await caseRow(id);
    const overlay = CaseOverlaySchema.parse(JSON.parse(row?.brief_partial_json ?? "null"));
    expect(overlay.story).toBe("Updated: wells now planned across three districts.");
    expect(overlay.vouching_narrative).toBe(VALID_BODY.vouching_narrative);

    const creatorDoc = await latestDocRow(id, "creator_id");
    expect(creatorDoc?.r2_key).toBe(`${id}/creator_id/uuid-abc`);
    const bankDoc = await latestDocRow(id, "bank_statement");
    expect(bankDoc?.r2_key).toBe(`${id}/bank_statement/uuid-def`);
  });

  it("clears vouching_narrative on edit (json_remove) while preserving documents rows", async () => {
    const id = await createCampaign(clientACookie);
    await seedDocRow(id, REVIEW_ORG_ID, "creator_id", `${id}/creator_id/uuid-xyz`);

    const res = await send("PATCH", `${CAMPAIGNS_URL}/${id}`, clientACookie, {
      title: VALID_BODY.title,
      story: "Cleared the vouching narrative.",
      organizer_name: VALID_BODY.organizer_name,
      category: VALID_BODY.category,
      geography: VALID_BODY.geography,
    });
    expect(res.status).toBe(200);

    const row = await caseRow(id);
    const overlay = CaseOverlaySchema.parse(JSON.parse(row?.brief_partial_json ?? "null"));
    expect(overlay.story).toBe("Cleared the vouching narrative.");
    expect(overlay.vouching_narrative).toBeUndefined();

    const creatorDoc = await latestDocRow(id, "creator_id");
    expect(creatorDoc?.r2_key).toBe(`${id}/creator_id/uuid-xyz`);
  });

  it("returns 409 when editing a campaign a reviewer has already moved on", async () => {
    const id = await createCampaign(clientACookie);
    await env.DB.prepare("UPDATE cases SET status = 'RUNNING' WHERE id = ?").bind(id).run();

    const res = await send("PATCH", `${CAMPAIGNS_URL}/${id}`, clientACookie, {
      ...VALID_BODY,
      story: "should not apply",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "case_no_longer_draft" });

    const row = await caseRow(id);
    const overlay = CaseOverlaySchema.parse(JSON.parse(row?.brief_partial_json ?? "null"));
    expect(overlay.story).toBe(VALID_BODY.story);
  });

  it("returns 404 when a client edits a sibling's campaign", async () => {
    const id = await createCampaign(clientACookie);
    const res = await send("PATCH", `${CAMPAIGNS_URL}/${id}`, clientBCookie, VALID_BODY);
    expect(res.status).toBe(404);
  });

  it("returns 409 case_decided when submitting a campaign a reviewer already approved", async () => {
    const id = await createCampaign(clientACookie);
    const now = Date.now();
    await env.DB.prepare("UPDATE cases SET status = 'ACTIONED', submitted_at = ? WHERE id = ?")
      .bind(now, id)
      .run();
    await env.DB.prepare(
      `INSERT INTO reviewer_actions (id, case_id, run_id, reviewer_id, action, rationale, acted_at, action_id, organization_id)
       VALUES (?, ?, ?, ?, 'APPROVE', 'x', ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        id,
        crypto.randomUUID(),
        reviewAdminId,
        now,
        crypto.randomUUID(),
        REVIEW_ORG_ID,
      )
      .run();

    const res = await send("POST", `${CAMPAIGNS_URL}/${id}/submit`, clientACookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "case_decided" });
  });
});

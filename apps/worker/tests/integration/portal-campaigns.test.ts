/**
 * Integration: client campaign intake — create + edit (U4).
 *
 * Proves: create lands a DRAFT case in the review org owned by the client with
 * a valid empty-evidence overlay; create validates required fields; edit
 * re-submits intake while preserving uploaded evidence keys; the edit is gated
 * atomically on status='DRAFT' (409 once a reviewer has moved the case on); a
 * client cannot edit a sibling's campaign (404).
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

async function createCampaign(cookie: string): Promise<string> {
  const res = await send("POST", CAMPAIGNS_URL, cookie, VALID_BODY);
  expect(res.status).toBe(201);
  return CampaignMutationResponseSchema.parse(await res.json()).id;
}

describe("portal campaigns", () => {
  let clientACookie = "";
  let clientBCookie = "";
  let clientAId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewAdmin = await signUp(`pc-admin-${Date.now()}@test.local`, "Review Admin");
    await seedReviewOrgWithAdmin(reviewAdmin.userId);
    const clientA = await signUp(`pc-clienta-${Date.now()}@test.local`, "Client A", "client");
    const clientB = await signUp(`pc-clientb-${Date.now()}@test.local`, "Client B", "client");
    clientACookie = clientA.cookie;
    clientAId = clientA.userId;
    clientBCookie = clientB.cookie;
  }, 60_000);

  it("creates a DRAFT campaign owned by the client with an empty-evidence overlay", async () => {
    const res = await send("POST", CAMPAIGNS_URL, clientACookie, VALID_BODY);
    expect(res.status).toBe(201);
    const created = CampaignMutationResponseSchema.parse(await res.json());
    expect(created.status).toBe("DRAFT");

    const row = await caseRow(created.id);
    expect(row?.status).toBe("DRAFT");
    expect(row?.organization_id).toBe(REVIEW_ORG_ID);
    expect(row?.created_by).toBe(clientAId);
    expect(row?.title).toBe(VALID_BODY.organizer_name);
    expect(row?.category).toBe(VALID_BODY.category);
    expect(row?.claimed_zakat_category).toBe(VALID_BODY.claimed_zakat_category);

    const overlay = CaseOverlaySchema.parse(JSON.parse(row?.brief_partial_json ?? "null"));
    expect(overlay.story).toBe(VALID_BODY.story);
    expect(overlay.organizer_name).toBe(VALID_BODY.organizer_name);
    expect(overlay.vouching_narrative).toBe(VALID_BODY.vouching_narrative);
    expect(overlay.r2_keys).toEqual({ creator_id: "", bank_statement: "", category_doc: "" });
  });

  it("rejects a create missing a required field (400)", async () => {
    const res = await send("POST", CAMPAIGNS_URL, clientACookie, {
      organizer_name: "No Story",
      category: "food_security",
      geography: "KE",
    });
    expect(res.status).toBe(400);
  });

  it("edits a DRAFT campaign and preserves already-uploaded evidence keys", async () => {
    const id = await createCampaign(clientACookie);
    const keys = {
      creator_id: `${id}/creator_id`,
      bank_statement: `${id}/bank`,
      category_doc: `${id}/cat`,
    };
    await env.DB.prepare("UPDATE cases SET brief_partial_json = ? WHERE id = ?")
      .bind(
        JSON.stringify({
          story: VALID_BODY.story,
          organizer_name: VALID_BODY.organizer_name,
          r2_keys: keys,
        }),
        id,
      )
      .run();

    const res = await send("PATCH", `${CAMPAIGNS_URL}/${id}`, clientACookie, {
      ...VALID_BODY,
      story: "Updated: wells now planned across three districts.",
    });
    expect(res.status).toBe(200);

    const row = await caseRow(id);
    const overlay = CaseOverlaySchema.parse(JSON.parse(row?.brief_partial_json ?? "null"));
    expect(overlay.story).toBe("Updated: wells now planned across three districts.");
    expect(overlay.vouching_narrative).toBe(VALID_BODY.vouching_narrative);
    expect(overlay.r2_keys).toEqual(keys);
  });

  it("clears vouching_narrative on edit (json_remove) while preserving evidence", async () => {
    const id = await createCampaign(clientACookie);
    const keys = { creator_id: `${id}/creator_id`, bank_statement: "", category_doc: "" };
    await env.DB.prepare("UPDATE cases SET brief_partial_json = ? WHERE id = ?")
      .bind(
        JSON.stringify({
          story: VALID_BODY.story,
          organizer_name: VALID_BODY.organizer_name,
          vouching_narrative: "old vouch",
          r2_keys: keys,
        }),
        id,
      )
      .run();

    const res = await send("PATCH", `${CAMPAIGNS_URL}/${id}`, clientACookie, {
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
    expect(overlay.r2_keys).toEqual(keys);
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
});

/**
 * Integration: the client draft lifecycle (server draft + submit + delete).
 *
 * Proves: a created campaign is a `draft`, editable + deletable; submit flips it
 * to `submitted`; submit is idempotent; an edit or delete after submit is
 * refused. The reviewer-queue exclusion of unsubmitted drafts is enforced by
 * `buildFilters` (`NOT (created-by-client AND submitted_at IS NULL)`) and
 * covered by the `cases-handler` truth table rather than re-driven here.
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { makeDb } from "@mizan/db";
import {
  CampaignMutationResponseSchema,
  ClientCaseDetailSchema,
  PortalErrorBodySchema,
  type ViewerContext,
} from "@mizan/shared";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { deleteDraftCampaign } from "../../src/routes/portal/delete-campaign.ts";
import { BASE, seedReviewOrgWithAdmin, send, signUp, submitCampaign } from "./portal-helpers.ts";

const CAMPAIGNS_URL = `${BASE}/api/portal/campaigns`;
const VALID_BODY = {
  story: "Funding clean-water wells across three rural districts.",
  organizer_name: "Ahmad Hassan",
  category: "food_security",
  geography: "KE",
};

async function createDraft(cookie: string): Promise<string> {
  const res = await send("POST", CAMPAIGNS_URL, cookie, VALID_BODY);
  expect(res.status).toBe(201);
  return CampaignMutationResponseSchema.parse(await res.json()).id;
}

async function clientStatus(id: string, cookie: string): Promise<string> {
  const res = await send("GET", `${CAMPAIGNS_URL}/${id}`, cookie);
  expect(res.status).toBe(200);
  return ClientCaseDetailSchema.parse(await res.json()).status;
}

describe("client draft lifecycle", () => {
  let clientCookie = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await signUp(`draft-admin-${Date.now()}@test.local`, "Draft Admin");
    await seedReviewOrgWithAdmin(admin.userId);
    clientCookie = (await signUp(`draft-client-${Date.now()}@test.local`, "Draft Client", "client"))
      .cookie;
  }, 60_000);

  it("a created campaign reads as an editable draft", async () => {
    const id = await createDraft(clientCookie);
    expect(await clientStatus(id, clientCookie)).toBe("draft");
    const edit = await send("PATCH", `${CAMPAIGNS_URL}/${id}`, clientCookie, {
      ...VALID_BODY,
      organizer_name: "Edited While Draft",
    });
    expect(edit.status).toBe(200);
  });

  it("submit flips the status from draft to submitted", async () => {
    const id = await createDraft(clientCookie);
    expect(await clientStatus(id, clientCookie)).toBe("draft");
    await submitCampaign(id, clientCookie);
    expect(await clientStatus(id, clientCookie)).toBe("submitted");
  });

  it("submit is idempotent (a second submit is a 200 no-op)", async () => {
    const id = await createDraft(clientCookie);
    await submitCampaign(id, clientCookie);
    await submitCampaign(id, clientCookie);
    expect(await clientStatus(id, clientCookie)).toBe("submitted");
  });

  it("refuses an edit after submit with 409 case_no_longer_draft", async () => {
    const id = await createDraft(clientCookie);
    await submitCampaign(id, clientCookie);
    const res = await send("PATCH", `${CAMPAIGNS_URL}/${id}`, clientCookie, {
      ...VALID_BODY,
      organizer_name: "Renamed Organizer",
    });
    expect(res.status).toBe(409);
    expect(PortalErrorBodySchema.parse(await res.json()).error).toBe("case_no_longer_draft");
  });

  it("deletes an unsubmitted draft (204) so it 404s afterward", async () => {
    const id = await createDraft(clientCookie);
    const del = await send("DELETE", `${CAMPAIGNS_URL}/${id}`, clientCookie);
    expect(del.status).toBe(204);
    expect((await send("GET", `${CAMPAIGNS_URL}/${id}`, clientCookie)).status).toBe(404);
  });

  it("refuses to delete a submitted campaign with 409 case_already_submitted", async () => {
    const id = await createDraft(clientCookie);
    await submitCampaign(id, clientCookie);
    const del = await send("DELETE", `${CAMPAIGNS_URL}/${id}`, clientCookie);
    expect(del.status).toBe(409);
    expect(PortalErrorBodySchema.parse(await del.json()).error).toBe("case_already_submitted");
  });

  it("deleteDraftCampaign on a since-submitted case leaves notes + documents intact (race guard)", async () => {
    const client = await signUp(`draft-race-${Date.now()}@test.local`, "Race Client", "client");
    const id = await createDraft(client.cookie);
    const orgRow = await env.DB.prepare("SELECT organization_id FROM cases WHERE id = ?")
      .bind(id)
      .first<{ organization_id: string }>();
    if (!orgRow) throw new Error("case org missing");
    const orgId = orgRow.organization_id;
    const noteId = crypto.randomUUID();
    const docId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO case_notes (id, case_id, organization_id, author_user_id, author_role, visibility, body, created_at)
       VALUES (?, ?, ?, ?, 'client', 'client_facing', 'note', ?)`,
    )
      .bind(noteId, id, orgId, client.userId, Date.now())
      .run();
    await env.DB.prepare(
      `INSERT INTO documents (id, case_id, doc_kind, r2_key, filename, content_type, uploaded_at, organization_id)
       VALUES (?, ?, 'creator_id', ?, 'id.png', 'image/png', ?, ?)`,
    )
      .bind(docId, id, `${id}/creator_id/${docId}`, Date.now(), orgId)
      .run();
    await submitCampaign(id, client.cookie);

    const viewer: ViewerContext = { userId: client.userId, role: "client", organizationId: orgId };
    await deleteDraftCampaign(env, makeDb(env.DB), viewer, id);

    const caseRow = await env.DB.prepare("SELECT id FROM cases WHERE id = ?").bind(id).first();
    const noteRow = await env.DB.prepare("SELECT id FROM case_notes WHERE id = ?")
      .bind(noteId)
      .first();
    const docRow = await env.DB.prepare("SELECT id FROM documents WHERE id = ?")
      .bind(docId)
      .first();
    expect(caseRow).not.toBeNull();
    expect(noteRow).not.toBeNull();
    expect(docRow).not.toBeNull();
  });
});

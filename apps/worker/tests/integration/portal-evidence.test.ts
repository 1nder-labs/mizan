/**
 * Integration: client evidence upload (U5).
 *
 * Proves: a core doc lands in R2 under the server-derived key `<caseId>/<docKind>`
 * and its key is recorded in the overlay (which still parses); re-upload
 * replaces the same key; wrong-MIME and oversize uploads are rejected 400; a
 * docKind outside the three core kinds is rejected so no key can escape the
 * `<caseId>/` prefix; uploading to a sibling's campaign is 404.
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import {
  CampaignMutationResponseSchema,
  CaseOverlaySchema,
  EvidenceUploadResponseSchema,
} from "@mizan/shared";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BASE, seedReviewOrgWithAdmin, signUp } from "./portal-helpers.ts";

const CAMPAIGNS_URL = `${BASE}/api/portal/campaigns`;

const VALID_BODY = {
  story: "Funding clean-water wells for rural villages this season.",
  organizer_name: "Ahmad Hassan",
  category: "water",
  geography: "KE",
};

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

async function createCampaign(cookie: string): Promise<string> {
  const res = await exports.default.fetch(
    new Request(CAMPAIGNS_URL, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    }),
  );
  expect(res.status).toBe(201);
  return CampaignMutationResponseSchema.parse(await res.json()).id;
}

function uploadEvidence(
  id: string,
  cookie: string,
  docKind: string,
  file: File,
): Promise<Response> {
  const form = new FormData();
  form.append("docKind", docKind);
  form.append("file", file);
  return exports.default.fetch(
    new Request(`${CAMPAIGNS_URL}/${id}/evidence`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    }),
  );
}

async function overlayOf(id: string) {
  const row = await env.DB.prepare("SELECT brief_partial_json FROM cases WHERE id = ?")
    .bind(id)
    .first<{ brief_partial_json: string }>();
  return CaseOverlaySchema.parse(JSON.parse(row?.brief_partial_json ?? "null"));
}

describe("portal evidence upload", () => {
  let clientACookie = "";
  let clientBCookie = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewAdmin = await signUp(`pe-admin-${Date.now()}@test.local`, "Review Admin");
    await seedReviewOrgWithAdmin(reviewAdmin.userId);
    clientACookie = (await signUp(`pe-clienta-${Date.now()}@test.local`, "Client A", "client"))
      .cookie;
    clientBCookie = (await signUp(`pe-clientb-${Date.now()}@test.local`, "Client B", "client"))
      .cookie;
  }, 60_000);

  it("stores a core doc in R2 under <caseId>/<docKind> and records the key in the overlay", async () => {
    const id = await createCampaign(clientACookie);
    const res = await uploadEvidence(
      id,
      clientACookie,
      "creator_id",
      new File([PDF_BYTES], "id.pdf", { type: "application/pdf" }),
    );
    expect(res.status).toBe(201);
    const body = EvidenceUploadResponseSchema.parse(await res.json());
    expect(body).toEqual({ docKind: "creator_id", key: `${id}/creator_id` });

    expect(await env.R2_BUCKET.get(`${id}/creator_id`)).not.toBeNull();
    const overlay = await overlayOf(id);
    expect(overlay.r2_keys.creator_id).toBe(`${id}/creator_id`);
    expect(overlay.r2_keys.bank_statement).toBe("");
    expect(overlay.r2_keys.category_doc).toBe("");
  });

  it("replaces the same key on re-upload (overwrites the R2 object)", async () => {
    const id = await createCampaign(clientACookie);
    await uploadEvidence(
      id,
      clientACookie,
      "bank_statement",
      new File([PDF_BYTES], "b.pdf", { type: "application/pdf" }),
    );
    const res = await uploadEvidence(
      id,
      clientACookie,
      "bank_statement",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "b.png", { type: "image/png" }),
    );
    expect(res.status).toBe(201);

    const overlay = await overlayOf(id);
    expect(overlay.r2_keys.bank_statement).toBe(`${id}/bank_statement`);
    const obj = await env.R2_BUCKET.get(`${id}/bank_statement`);
    expect(obj?.httpMetadata?.contentType).toBe("image/png");
  });

  it("rejects a disallowed MIME type (400)", async () => {
    const id = await createCampaign(clientACookie);
    const res = await uploadEvidence(
      id,
      clientACookie,
      "creator_id",
      new File([new Uint8Array([1, 2, 3])], "x.txt", { type: "text/plain" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an oversize file (400)", async () => {
    const id = await createCampaign(clientACookie);
    const res = await uploadEvidence(
      id,
      clientACookie,
      "creator_id",
      new File([new Uint8Array(26 * 1024 * 1024)], "big.pdf", { type: "application/pdf" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a docKind outside the three core kinds so no key escapes the prefix (400)", async () => {
    const id = await createCampaign(clientACookie);
    const res = await uploadEvidence(
      id,
      clientACookie,
      "../../evil",
      new File([PDF_BYTES], "x.pdf", { type: "application/pdf" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when uploading to a sibling's campaign", async () => {
    const id = await createCampaign(clientACookie);
    const res = await uploadEvidence(
      id,
      clientBCookie,
      "creator_id",
      new File([PDF_BYTES], "x.pdf", { type: "application/pdf" }),
    );
    expect(res.status).toBe(404);
  });
});

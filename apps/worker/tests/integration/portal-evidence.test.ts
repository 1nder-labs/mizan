/**
 * Integration: client evidence upload (U5).
 *
 * Proves: a core doc lands in R2 under the versioned key
 * `<caseId>/<docKind>/<uuid>` and its key is recorded as the current
 * `documents` row; re-upload adds a NEW version (latest row wins); wrong-MIME
 * and oversize uploads are rejected 400; a file whose bytes don't match its
 * claimed MIME (a spoofed PDF) is rejected by the magic-byte sniff; a docKind
 * outside the three core kinds is rejected so no key can escape the `<caseId>/`
 * prefix; uploading to a sibling's campaign is 404; a decided (APPROVE/BLOCK)
 * case rejects uploads 409 while a REQUEST_DOCS case still accepts the client's
 * response.
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import {
  CampaignMutationResponseSchema,
  EvidenceUploadResponseSchema,
  PortalErrorBodySchema,
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
  story: "Funding clean-water wells for rural villages this season.",
  organizer_name: "Ahmad Hassan",
  category: "food_security",
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

/** Returns the most-recent documents row for a (case, docKind) pair, or null. */
async function latestDocRow(caseId: string, docKind: string): Promise<{ r2_key: string } | null> {
  return env.DB.prepare(
    "SELECT r2_key FROM documents WHERE case_id = ? AND doc_kind = ? ORDER BY uploaded_at DESC LIMIT 1",
  )
    .bind(caseId, docKind)
    .first<{ r2_key: string }>();
}

/** Returns the total number of documents rows for a (case, docKind) pair. */
async function docRowCount(caseId: string, docKind: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM documents WHERE case_id = ? AND doc_kind = ?",
  )
    .bind(caseId, docKind)
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

async function insertAction(caseId: string, reviewerId: string, action: string): Promise<void> {
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
      Date.now(),
      crypto.randomUUID(),
      REVIEW_ORG_ID,
    )
    .run();
}

describe("portal evidence upload", () => {
  let clientACookie = "";
  let clientBCookie = "";
  let reviewAdminId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewAdmin = await signUp(`pe-admin-${Date.now()}@test.local`, "Review Admin");
    reviewAdminId = reviewAdmin.userId;
    await seedReviewOrgWithAdmin(reviewAdmin.userId);
    clientACookie = (await signUp(`pe-clienta-${Date.now()}@test.local`, "Client A", "client"))
      .cookie;
    clientBCookie = (await signUp(`pe-clientb-${Date.now()}@test.local`, "Client B", "client"))
      .cookie;
  }, 60_000);

  it("stores a core doc in R2 under a versioned key and records a documents row", async () => {
    const id = await createCampaign(clientACookie);
    const res = await uploadEvidence(
      id,
      clientACookie,
      "creator_id",
      new File([PDF_BYTES], "id.pdf", { type: "application/pdf" }),
    );
    expect(res.status).toBe(201);
    const body = EvidenceUploadResponseSchema.parse(await res.json());
    expect(body.docKind).toBe("creator_id");
    expect(body.key.startsWith(`${id}/creator_id/`)).toBe(true);

    const r2Obj = await env.R2_BUCKET.get(body.key);
    expect(r2Obj).not.toBeNull();

    const docRow = await latestDocRow(id, "creator_id");
    expect(docRow).not.toBeNull();
    expect(docRow?.r2_key).toBe(body.key);
  });

  it("re-upload adds a new version row (two rows, latest has the new key)", async () => {
    const id = await createCampaign(clientACookie);
    const res1 = await uploadEvidence(
      id,
      clientACookie,
      "bank_statement",
      new File([PDF_BYTES], "b.pdf", { type: "application/pdf" }),
    );
    expect(res1.status).toBe(201);
    const key1 = EvidenceUploadResponseSchema.parse(await res1.json()).key;

    const res2 = await uploadEvidence(
      id,
      clientACookie,
      "bank_statement",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "b.png", { type: "image/png" }),
    );
    expect(res2.status).toBe(201);
    const key2 = EvidenceUploadResponseSchema.parse(await res2.json()).key;

    expect(key2).not.toBe(key1);
    expect(await docRowCount(id, "bank_statement")).toBe(2);

    const latest = await latestDocRow(id, "bank_statement");
    expect(latest?.r2_key).toBe(key2);

    const obj = await env.R2_BUCKET.get(key2);
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

  it("rejects a file whose bytes don't match its claimed MIME (spoofed PDF, 400)", async () => {
    const id = await createCampaign(clientACookie);
    const html = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>");
    const res = await uploadEvidence(
      id,
      clientACookie,
      "creator_id",
      new File([html], "evil.pdf", { type: "application/pdf" }),
    );
    expect(res.status).toBe(400);
  });

  it("blocks an upload to a decided (APPROVE) case with 409 case_decided", async () => {
    const id = await createCampaign(clientACookie);
    await submitCampaign(id, clientACookie);
    await insertAction(id, reviewAdminId, "APPROVE");
    const res = await uploadEvidence(
      id,
      clientACookie,
      "creator_id",
      new File([PDF_BYTES], "id.pdf", { type: "application/pdf" }),
    );
    expect(res.status).toBe(409);
    expect(PortalErrorBodySchema.parse(await res.json()).error).toBe("case_decided");
  });

  it("still allows an upload responding to a REQUEST_DOCS (the doc-request flow)", async () => {
    const id = await createCampaign(clientACookie);
    await insertAction(id, reviewAdminId, "REQUEST_DOCS");
    const res = await uploadEvidence(
      id,
      clientACookie,
      "creator_id",
      new File([PDF_BYTES], "id.pdf", { type: "application/pdf" }),
    );
    expect(res.status).toBe(201);
  });

  it("returns 400 (not 500) when the evidence body is not valid multipart", async () => {
    const id = await createCampaign(clientACookie);
    const res = await exports.default.fetch(
      new Request(`${CAMPAIGNS_URL}/${id}/evidence`, {
        method: "POST",
        headers: { Cookie: clientACookie, "Content-Type": "multipart/form-data" },
        body: "not a valid multipart payload",
      }),
    );
    expect(res.status).toBe(400);
  });
});

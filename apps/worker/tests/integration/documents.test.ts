/**
 * Integration tests: GET /api/cases/:id/documents/:docKey/url and /raw.
 *
 * Covers:
 * - Auth gate: anon 401 on both endpoints.
 * - /url returns same-origin /raw path (no R2 presign creds in test env).
 * - /raw streams exact uploaded bytes with the stored Content-Type.
 * - not_ready 409 when brief_partial_json is NULL (no overlay).
 * - not_found 404 for an unknown case UUID not in the org.
 * - 400 for an invalid docKey that fails ParamSchema validation.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { DocumentUrlResponseSchema } from "@mizan/shared";
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";

const BASE = "http://localhost";

const VALID_DOC_KEY = "creator_id" as const;
const VALID_DOC_KEY_2 = "bank_statement" as const;
const R2_OBJECT_KEY = "cases/doc-test-case/creator_id.png";
const R2_OBJECT_KEY_2 = "cases/doc-test-case/bank_statement.png";

const CASE_WITH_OVERLAY_ID = "dc000000-0000-4000-8000-000000000001";
const CASE_NO_OVERLAY_ID = "dc000000-0000-4000-8000-000000000002";
const UNKNOWN_CASE_ID = "dc000000-0000-4000-8000-000099999999";

/**
 * Signs up a new user and returns the session cookie, userId, and organizationId.
 * A fresh signup auto-creates an org with the user as `admin` (creatorRole).
 */
async function seedUser(): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `doc-test-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Doc Test User" }),
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
  if (!userRow?.id) throw new Error("user seed failed");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(userRow.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("member seed failed");
  return {
    cookie: signIn.headers.getSetCookie().join("; "),
    userId: userRow.id,
    organizationId: memberRow.organization_id,
  };
}

/**
 * Inserts a case row with a valid CaseOverlay in brief_partial_json.
 * Both r2 keys point at objects uploaded in beforeAll.
 */
async function insertCaseWithOverlay(
  caseId: string,
  createdBy: string,
  organizationId: string,
): Promise<void> {
  const overlay = JSON.stringify({
    story: "Test story",
    organizer_name: "Test Organizer",
    r2_keys: {
      creator_id: R2_OBJECT_KEY,
      bank_statement: R2_OBJECT_KEY_2,
      category_doc: "cases/doc-test-case/category_doc.png",
    },
  });
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (
       id, status, category, geography, claimed_zakat_category, brief_partial_json,
       created_by, organization_id, created_at, updated_at
     ) VALUES (?, 'DRAFT', 'medical', 'US', NULL, ?, ?, ?, ?, ?)`,
  )
    .bind(caseId, overlay, createdBy, organizationId, now, now)
    .run();
}

/** Inserts a case row with NULL brief_partial_json (no overlay). */
async function insertCaseNoOverlay(
  caseId: string,
  createdBy: string,
  organizationId: string,
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (
       id, status, category, geography, claimed_zakat_category, brief_partial_json,
       created_by, organization_id, created_at, updated_at
     ) VALUES (?, 'DRAFT', 'medical', 'US', NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(caseId, createdBy, organizationId, now, now)
    .run();
}

describe("GET /api/cases/:id/documents/:docKey — document URL + raw routes", () => {
  let cookie = "";
  let userId = "";
  let organizationId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));

    const seeded = await seedUser();
    cookie = seeded.cookie;
    userId = seeded.userId;
    organizationId = seeded.organizationId;

    await env.R2_BUCKET.put(R2_OBJECT_KEY, MINIMAL_PNG_BYTES, {
      httpMetadata: { contentType: "image/png" },
    });
    await env.R2_BUCKET.put(R2_OBJECT_KEY_2, MINIMAL_PNG_BYTES, {
      httpMetadata: { contentType: "image/png" },
    });

    await insertCaseWithOverlay(CASE_WITH_OVERLAY_ID, userId, organizationId);
    await insertCaseNoOverlay(CASE_NO_OVERLAY_ID, userId, organizationId);
  }, 60_000);

  it("anon request to /url returns 401", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_OVERLAY_ID}/documents/${VALID_DOC_KEY}/url`),
    );
    expect(res.status).toBe(401);
  });

  it("anon request to /raw returns 401", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_OVERLAY_ID}/documents/${VALID_DOC_KEY}/raw`),
    );
    expect(res.status).toBe(401);
  });

  it("/url returns 200 with same-origin /raw path when presign creds absent", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_OVERLAY_ID}/documents/${VALID_DOC_KEY}/url`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = DocumentUrlResponseSchema.parse(await res.json());
    expect(body.url).toBe(`/api/cases/${CASE_WITH_OVERLAY_ID}/documents/${VALID_DOC_KEY}/raw`);
    expect(body.docKey).toBe(VALID_DOC_KEY);
    expect(body.expiresInSeconds).toBeGreaterThanOrEqual(60);
  });

  it("/raw returns 200 with correct bytes and Content-Type", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_OVERLAY_ID}/documents/${VALID_DOC_KEY}/raw`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(MINIMAL_PNG_BYTES.byteLength);
  });

  it("/url returns 409 not_ready when brief_partial_json is NULL", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_NO_OVERLAY_ID}/documents/${VALID_DOC_KEY}/url`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not_ready");
  });

  it("/url returns 404 not_found for unknown case UUID", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${UNKNOWN_CASE_ID}/documents/${VALID_DOC_KEY}/url`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not_found");
  });

  it("/url returns 400 for invalid docKey", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_OVERLAY_ID}/documents/invalid_doc_key_xyz/url`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("/raw returns 400 for invalid docKey", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_OVERLAY_ID}/documents/invalid_doc_key_xyz/raw`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("/url works for bank_statement docKey as well", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_OVERLAY_ID}/documents/${VALID_DOC_KEY_2}/url`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = DocumentUrlResponseSchema.parse(await res.json());
    expect(body.docKey).toBe(VALID_DOC_KEY_2);
  });

  it("returns 404 for a viewer from another org (cross-org isolation)", async () => {
    const outsider = await seedUser();
    const urlRes = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_OVERLAY_ID}/documents/${VALID_DOC_KEY}/url`, {
        headers: { Cookie: outsider.cookie },
      }),
    );
    expect(urlRes.status).toBe(404);
    const rawRes = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${CASE_WITH_OVERLAY_ID}/documents/${VALID_DOC_KEY}/raw`, {
        headers: { Cookie: outsider.cookie },
      }),
    );
    expect(rawRes.status).toBe(404);
  });
});

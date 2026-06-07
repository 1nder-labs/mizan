/** Shared D1 seeding helpers for the queue/case integration tests. */
import { env, exports } from "cloudflare:workers";

const BASE = "http://localhost";

/** Signs up a reviewer account and returns the session cookie, userId, and organizationId. */
export async function seedReviewer(): Promise<{
  cookie: string;
  userId: string;
  organizationId: string;
}> {
  const email = `list-reviewer-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "List Reviewer" }),
    }),
  );
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row?.id) throw new Error("reviewer seed failed");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("reviewer org seed failed");
  return {
    cookie: signIn.headers.getSetCookie().join("; "),
    userId: row.id,
    organizationId: memberRow.organization_id,
  };
}

/** Signs up an admin account and returns the session cookie + userId. */
export async function seedAdmin(): Promise<{ cookie: string; userId: string }> {
  const email = `list-admin-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "List Admin" }),
    }),
  );
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row?.id) throw new Error("admin seed failed");
  return { cookie: signIn.headers.getSetCookie().join("; "), userId: row.id };
}

/** Inserts a case row directly into D1. */
export async function insertCase(opts: {
  id: string;
  status: string;
  category: string;
  geography: string;
  createdBy: string;
  organizationId: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
}): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, title, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       updated_at = excluded.updated_at`,
  )
    .bind(
      opts.id,
      opts.status,
      opts.title ?? "",
      opts.category,
      opts.geography,
      opts.createdBy,
      opts.organizationId,
      opts.createdAt ?? now,
      opts.updatedAt ?? now,
    )
    .run();
}

const SEED_DOC_KINDS = ["creator_id", "bank_statement", "category_doc"] as const;

/**
 * Inserts the three extraction-slot `documents` rows pointing at the given R2
 * keys — the documents-table replacement for the old overlay `r2_keys`. Ids are
 * deterministic (`<caseId>-<kind>`) so re-seeding is idempotent. Call alongside
 * the case insert for any test that runs the workflow or reads current evidence.
 */
export async function seedDocuments(opts: {
  caseId: string;
  organizationId: string;
  keys: { creator_id: string; bank_statement: string; category_doc: string };
  uploadedAt?: number;
}): Promise<void> {
  const ts = opts.uploadedAt ?? Date.now();
  for (const kind of SEED_DOC_KINDS) {
    await env.DB.prepare(
      `INSERT INTO documents (id, case_id, doc_kind, r2_key, filename, content_type, uploaded_at, organization_id)
       VALUES (?, ?, ?, ?, '', 'image/png', ?, ?) ON CONFLICT(id) DO NOTHING`,
    )
      .bind(`${opts.caseId}-${kind}`, opts.caseId, kind, opts.keys[kind], ts, opts.organizationId)
      .run();
  }
}

/** Inserts a brief row for a case, using a minimal valid payload_json. */
export async function insertBrief(opts: {
  id: string;
  caseId: string;
  runId: string;
  recommendation: string;
  verificationPath: string;
  organizationId: string;
  composedAt?: number;
}): Promise<void> {
  const payload = JSON.stringify({
    recommendation: opts.recommendation,
    verification_path: opts.verificationPath,
    geography_tier: "SAFE",
    policy_grounded: true,
    missing_docs: [],
    reviewer_questions: [],
    extracted_claims: "Test claims.",
    confidence: 80,
    policy_citations: [],
  });
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO briefs (id, case_id, run_id, recommendation, confidence, composed_at, payload_json, organization_id)
     VALUES (?, ?, ?, ?, 80, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(
      opts.id,
      opts.caseId,
      opts.runId,
      opts.recommendation,
      opts.composedAt ?? now,
      payload,
      opts.organizationId,
    )
    .run();
}

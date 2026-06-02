/**
 * Shared helpers for client-portal integration tests.
 *
 * Extracted from the 7 portal-facing test files to eliminate duplication.
 * Only the 5 truly-shared utilities live here; file-specific fixtures remain
 * local.
 */
import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";

export const BASE = "http://localhost";
export const PW = "CorrectHorse99!!";
export const REVIEW_ORG_ID = "review-org-fixture";

/** Joins all `Set-Cookie` headers from a response into a single cookie string. */
export function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

/**
 * Signs up a new user via `/api/auth/sign-up/email` and returns the user id
 * and session cookie. Normalises the email to lowercase before signing up,
 * which mirrors the behaviour all portal test files already apply.
 *
 * `signupKind` is included in the body only when provided so that non-client
 * sign-ups never receive the field.
 */
export async function signUp(
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

/**
 * Seeds the review org and an admin member row.
 *
 * `orgId` defaults to `REVIEW_ORG_ID`. Uses the `orgId` value for both the
 * org slug and a human-readable `name` so that callers seeding a second org
 * get a distinct slug and no `INSERT OR IGNORE` silently no-ops on a
 * slug-uniqueness collision.
 */
export async function seedReviewOrgWithAdmin(
  adminUserId: string,
  orgId = REVIEW_ORG_ID,
): Promise<void> {
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

/**
 * Performs a JSON (or body-less) fetch through the worker under test.
 * Sets `Content-Type: application/json` only when a body is supplied.
 */
export function send(
  method: string,
  url: string,
  cookie: string,
  body?: unknown,
): Promise<Response> {
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

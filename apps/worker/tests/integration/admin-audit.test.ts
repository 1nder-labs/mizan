/**
 * Integration: GET /api/admin/audit — paginated reviewer-action feed.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const BASE = "http://localhost";

async function seedUser(
  role: "reviewer" | "admin",
): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `audit-${role}-${Date.now()}-${Math.random()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: `Audit ${role}` }),
    }),
  );
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row?.id) throw new Error("seed failed");
  if (role === "reviewer") {
    await env.DB.prepare("UPDATE members SET role = 'reviewer' WHERE user_id = ?")
      .bind(row.id)
      .run();
  }
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("audit org seed failed");
  return {
    cookie: signIn.headers.getSetCookie().join("; "),
    userId: row.id,
    organizationId: memberRow.organization_id,
  };
}

async function insertCaseAndAction(
  reviewerId: string,
  organizationId: string,
  action: string,
  rationale: string,
): Promise<void> {
  const caseId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
     VALUES (?, 'ACTIONED', 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(caseId, reviewerId, organizationId, now, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO reviewer_actions (id, case_id, run_id, reviewer_id, action, rationale, action_id, organization_id, acted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      caseId,
      runId,
      reviewerId,
      action,
      rationale,
      crypto.randomUUID(),
      organizationId,
      now,
    )
    .run();
}

interface AuditBody {
  entries: ReadonlyArray<{ action: string; rationale: string; reviewer_email: string }>;
  page: number;
  page_size: number;
  total: number;
}

describe("GET /api/admin/audit", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("returns 401 when unauthenticated", async () => {
    const res = await exports.default.fetch(new Request(`${BASE}/api/admin/audit?page=1`));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a reviewer (non-admin) session", async () => {
    const { cookie } = await seedUser("reviewer");
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/admin/audit?page=1`, { headers: { Cookie: cookie } }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with entries + pagination meta for admin", async () => {
    const { cookie, userId, organizationId } = await seedUser("admin");
    await insertCaseAndAction(userId, organizationId, "APPROVE", "looks good");
    await insertCaseAndAction(userId, organizationId, "ESCALATE", "needs higher review");

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/admin/audit?page=1&page_size=25`, { headers: { Cookie: cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuditBody;
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(25);
    expect(body.total).toBeGreaterThanOrEqual(2);
    const actions = body.entries.map((e) => e.action);
    expect(actions).toContain("APPROVE");
    expect(actions).toContain("ESCALATE");
  });

  it("honors page_size pagination", async () => {
    const { cookie, userId, organizationId } = await seedUser("admin");
    await insertCaseAndAction(userId, organizationId, "REQUEST_DOCS", "missing bank statement");

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/admin/audit?page=1&page_size=1`, { headers: { Cookie: cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuditBody;
    expect(body.entries).toHaveLength(1);
    expect(body.page_size).toBe(1);
  });
});

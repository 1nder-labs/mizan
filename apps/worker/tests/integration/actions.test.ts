/**
 * Integration: POST /api/cases/:id/action — request validation + auth + claim guard.
 * Full HITL resume path covered in `hitl-cycle.test.ts`.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const BASE = "http://localhost";

async function seedReviewer(): Promise<{ cookie: string; userId: string }> {
  const email = `actions-reviewer-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Actions Reviewer" }),
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
  return { cookie: signIn.headers.getSetCookie().join("; "), userId: row.id };
}

async function insertCase(opts: {
  id: string;
  status: string;
  createdBy: string;
  currentRunId?: string | null;
}): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, current_run_id, created_by, created_at, updated_at)
     VALUES (?, ?, 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, current_run_id = excluded.current_run_id, updated_at = excluded.updated_at`,
  )
    .bind(opts.id, opts.status, opts.currentRunId ?? null, opts.createdBy, now, now)
    .run();
}

function postAction(caseId: string, cookie: string, body: Record<string, unknown>): Request {
  return new Request(`${BASE}/api/cases/${caseId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cases/:id/action", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("returns 401 without a session", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/550e8400-e29b-41d4-a716-446655440099/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE", rationale: "", action_id: crypto.randomUUID() }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when :id is not a UUID", async () => {
    const { cookie } = await seedReviewer();
    const res = await exports.default.fetch(
      postAction("not-a-uuid", cookie, {
        action: "APPROVE",
        rationale: "",
        action_id: crypto.randomUUID(),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when OVERRIDE arrives with an empty rationale (server-side superRefine)", async () => {
    const { cookie, userId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      status: "SUSPENDED_HITL",
      createdBy: userId,
      currentRunId: crypto.randomUUID(),
    });

    const res = await exports.default.fetch(
      postAction(caseId, cookie, {
        action: "OVERRIDE",
        rationale: "",
        action_id: crypto.randomUUID(),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown case id (UUID-shaped)", async () => {
    const { cookie } = await seedReviewer();
    const res = await exports.default.fetch(
      postAction("550e8400-e29b-41d4-a716-446655440011", cookie, {
        action: "APPROVE",
        rationale: "",
        action_id: crypto.randomUUID(),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when case is not SUSPENDED_HITL (claim guard)", async () => {
    const { cookie, userId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      status: "READY_FOR_REVIEW",
      createdBy: userId,
      currentRunId: crypto.randomUUID(),
    });

    const res = await exports.default.fetch(
      postAction(caseId, cookie, {
        action: "APPROVE",
        rationale: "",
        action_id: crypto.randomUUID(),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("not_suspended_or_claimed");
  });

  it("returns 409 with no_run when case has no current_run_id", async () => {
    const { cookie, userId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      status: "SUSPENDED_HITL",
      createdBy: userId,
      currentRunId: null,
    });

    const res = await exports.default.fetch(
      postAction(caseId, cookie, {
        action: "APPROVE",
        rationale: "",
        action_id: crypto.randomUUID(),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("no_run");
  });
});

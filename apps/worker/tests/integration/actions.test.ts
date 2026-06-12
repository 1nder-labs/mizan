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

async function seedReviewer(): Promise<{ cookie: string; userId: string; organizationId: string }> {
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
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("actions reviewer org seed failed");
  return {
    cookie: signIn.headers.getSetCookie().join("; "),
    userId: row.id,
    organizationId: memberRow.organization_id,
  };
}

async function insertCase(opts: {
  id: string;
  status: string;
  createdBy: string;
  organizationId: string;
  currentRunId?: string | null;
}): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, current_run_id, created_by, organization_id, created_at, updated_at)
     VALUES (?, ?, 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, current_run_id = excluded.current_run_id, updated_at = excluded.updated_at`,
  )
    .bind(
      opts.id,
      opts.status,
      opts.currentRunId ?? null,
      opts.createdBy,
      opts.organizationId,
      now,
      now,
    )
    .run();
}

function postAction(caseId: string, cookie: string, body: Record<string, unknown>): Request {
  return new Request(`${BASE}/api/cases/${caseId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
}

/**
 * Seeds a brief whose `reviewer_questions[0]` carries an unexpected legacy key
 * (`suggestedAnswer`). It parses under an older schema but fails the current
 * strict `BriefPayloadSchema` — the exact shape that, before the harden, threw
 * in `buildResponse` AFTER the action had already committed.
 */
async function seedBriefWithLegacyKey(
  caseId: string,
  runId: string,
  organizationId: string,
): Promise<void> {
  const payload = JSON.stringify({
    recommendation: "READY_FOR_REVIEW",
    verification_path: "documentary",
    geography_tier: "SAFE",
    policy_grounded: true,
    missing_docs: [],
    reviewer_questions: [{ question: "Confirm the beneficiary?", suggestedAnswer: "legacy" }],
    extracted_claims: "claims",
    confidence: 80,
    policy_citations: [],
  });
  await env.DB.prepare(
    `INSERT INTO briefs (id, case_id, run_id, recommendation, confidence, composed_at, payload_json, organization_id)
     VALUES (?, ?, ?, 'READY_FOR_REVIEW', 80, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), caseId, runId, Date.now(), payload, organizationId)
    .run();
}

/** Seeds a brief whose payload passes the current strict `BriefPayloadSchema`. */
async function seedValidBrief(
  caseId: string,
  runId: string,
  organizationId: string,
): Promise<void> {
  const payload = JSON.stringify({
    recommendation: "BLOCK",
    verification_path: "documentary",
    geography_tier: "SAFE",
    policy_grounded: true,
    missing_docs: [],
    reviewer_questions: [{ question: "Confirm the beneficiary?" }],
    extracted_claims: "claims",
    confidence: 80,
    policy_citations: [],
  });
  await env.DB.prepare(
    `INSERT INTO briefs (id, case_id, run_id, recommendation, confidence, composed_at, payload_json, organization_id)
     VALUES (?, ?, ?, 'BLOCK', 80, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), caseId, runId, Date.now(), payload, organizationId)
    .run();
}

/** Counts live_events for a topic + event_type scoped to one case via the payload. */
async function countEvents(topic: string, eventType: string, caseId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM live_events
     WHERE topic = ? AND event_type = ? AND json_extract(payload_json, '$.case_id') = ?`,
  )
    .bind(topic, eventType, caseId)
    .first<{ n: number }>();
  return row?.n ?? 0;
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
    const { cookie, userId, organizationId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      status: "SUSPENDED_HITL",
      createdBy: userId,
      organizationId,
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

  it("returns 409 when case is not claimable (ACTIONED — claim guard)", async () => {
    const { cookie, userId, organizationId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      status: "ACTIONED",
      createdBy: userId,
      organizationId,
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
    const { cookie, userId, organizationId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      status: "SUSPENDED_HITL",
      createdBy: userId,
      organizationId,
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

  it("a brief that fails strict parse reverts the claim cleanly — never commits then 500s", async () => {
    const { cookie, userId, organizationId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      status: "SUSPENDED_HITL",
      createdBy: userId,
      organizationId,
      currentRunId: runId,
    });
    await seedBriefWithLegacyKey(caseId, runId, organizationId);

    const res = await exports.default.fetch(
      postAction(caseId, cookie, {
        action: "ESCALATE",
        rationale: "",
        action_id: crypto.randomUUID(),
      }),
    );

    expect(res.status).toBe(500);
    expect((await res.json()) as { error?: string }).toEqual({ error: "workflow_failed" });

    const caseRow = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(caseRow?.status).toBe("SUSPENDED_HITL");

    const actionRow = await env.DB.prepare(
      "SELECT id FROM reviewer_actions WHERE case_id = ? LIMIT 1",
    )
      .bind(caseId)
      .first<{ id: string }>();
    expect(actionRow).toBeNull();
  });

  it("BLOCK claims with a status_changed event, then archives + emits case.archived", async () => {
    const { cookie, userId, organizationId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertCase({
      id: caseId,
      status: "SUSPENDED_HITL",
      createdBy: userId,
      organizationId,
      currentRunId: runId,
    });
    await seedValidBrief(caseId, runId, organizationId);

    const res = await exports.default.fetch(
      postAction(caseId, cookie, {
        action: "BLOCK",
        rationale: "Identity could not be verified.",
        action_id: crypto.randomUUID(),
      }),
    );
    expect(res.status).toBe(200);

    const caseRow = await env.DB.prepare("SELECT status, archived_at FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; archived_at: number | null }>();
    expect(caseRow?.status).toBe("ACTIONED");
    expect(caseRow?.archived_at).not.toBeNull();

    const claim = await countEvents(`org:${organizationId}`, "case.status_changed", caseId);
    expect(claim).toBeGreaterThanOrEqual(1);
    const orgArchived = await countEvents(`org:${organizationId}`, "case.archived", caseId);
    const caseArchived = await countEvents(`case:${caseId}`, "case.archived", caseId);
    expect(orgArchived).toBeGreaterThanOrEqual(1);
    expect(caseArchived).toBe(1);
  });
});

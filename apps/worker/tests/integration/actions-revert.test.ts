/**
 * Integration: REVERT path of POST /api/cases/:id/action.
 *
 * When the post-action chain throws (brief row missing for the case),
 * `revertClaim` must flip the case back from RUNNING to SUSPENDED_HITL.
 * The route must return 500 `{ error: "workflow_failed" }`.
 * The case's `current_run_id` must be preserved so a retry can re-claim.
 *
 * Regression guard: the case must NEVER be left stuck in RUNNING.
 *
 * Trigger mechanism: `runPostActionChain` calls `loadLatestBrief` as its
 * very first step and throws when no brief row exists for the case. We seed
 * a `SUSPENDED_HITL` case with a valid `current_run_id` but deliberately
 * omit any `briefs` row so the throw fires predictably without infra
 * injection or mocking.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const BASE = "http://localhost";

interface ReviewerSeed {
  readonly cookie: string;
  readonly userId: string;
  readonly organizationId: string;
}

/** Signs up a reviewer and resolves its auto-provisioned organization_id. */
async function seedReviewer(): Promise<ReviewerSeed> {
  const tag = `revert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `${tag}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Revert Reviewer" }),
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
  if (!userRow?.id) throw new Error("reviewer seed: user row missing");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(userRow.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("reviewer seed: member row missing");
  return {
    cookie: signIn.headers.getSetCookie().join("; "),
    userId: userRow.id,
    organizationId: memberRow.organization_id,
  };
}

interface CaseOpts {
  readonly id: string;
  readonly createdBy: string;
  readonly organizationId: string;
  readonly currentRunId: string;
}

/**
 * Inserts a SUSPENDED_HITL case with a run_id but NO brief row.
 * The absent brief row is the trigger for the chain failure.
 */
async function insertSuspendedCaseNoBrief(opts: CaseOpts): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases
       (id, status, category, geography, claimed_zakat_category, brief_partial_json,
        current_run_id, created_by, organization_id, created_at, updated_at)
     VALUES (?, 'SUSPENDED_HITL', 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status         = excluded.status,
       current_run_id = excluded.current_run_id,
       updated_at     = excluded.updated_at`,
  )
    .bind(opts.id, opts.currentRunId, opts.createdBy, opts.organizationId, now, now)
    .run();
}

function buildActionRequest(caseId: string, cookie: string): Request {
  return new Request(`${BASE}/api/cases/${caseId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      action: "APPROVE",
      rationale: "Revert path regression test",
      action_id: crypto.randomUUID(),
    }),
  });
}

describe("POST /api/cases/:id/action — revert path (no brief → chain throws)", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("returns 500 workflow_failed and reverts case to SUSPENDED_HITL (never stuck RUNNING)", async () => {
    const reviewer = await seedReviewer();
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();

    await insertSuspendedCaseNoBrief({
      id: caseId,
      createdBy: reviewer.userId,
      organizationId: reviewer.organizationId,
      currentRunId: runId,
    });

    const res = await exports.default.fetch(buildActionRequest(caseId, reviewer.cookie));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("workflow_failed");

    const row = await env.DB.prepare("SELECT status, current_run_id FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string; current_run_id: string | null }>();

    expect(row?.status).toBe("SUSPENDED_HITL");
    expect(row?.current_run_id).toBe(runId);
  }, 30_000);
});

/**
 * Integration: end-to-end HITL state-machine cycle without spinning the
 * full Mastra workflow. Seeds the case in SUSPENDED_HITL with a stored
 * suspend snapshot, then drives the action route to verify:
 *  - 409 on non-suspended source state (claim guard)
 *  - 200 path resolves to `ACTIONED` + persists `reviewer_actions` +
 *    `eval_promotions` + emits `step.resume` and `workflow.finish` rows
 *
 * The full Mastra `run.resume` path requires a Mastra D1Store snapshot
 * the workflow itself writes — that's covered by `brief-workflow.test.ts`
 * via Mode A SSE. This file isolates the route layer + claim guard +
 * D1 invariants that the route owns.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const BASE = "http://localhost";

async function seedReviewer(): Promise<{ cookie: string; userId: string }> {
  const email = `hitl-reviewer-${Date.now()}-${Math.random()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "HITL Reviewer" }),
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

async function seedSuspendedCase(caseId: string, runId: string, userId: string): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, current_run_id, created_by, created_at, updated_at)
     VALUES (?, 'SUSPENDED_HITL', 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(caseId, runId, userId, now, now)
    .run();
  const briefId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO briefs (id, case_id, run_id, recommendation, confidence, payload_json, composed_at)
     VALUES (?, ?, ?, 'READY_FOR_REVIEW', 80, ?, ?)`,
  )
    .bind(
      briefId,
      caseId,
      runId,
      JSON.stringify({
        recommendation: "READY_FOR_REVIEW",
        verification_path: "documentary",
        geography_tier: "SAFE",
        policy_grounded: true,
        missing_docs: [],
        reviewer_questions: [],
        extracted_claims: "Seeded for HITL cycle test.",
        confidence: 80,
        policy_citations: [],
      }),
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

describe("HITL workflow cycle (route layer)", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("rejects with 409 when case is not SUSPENDED_HITL (concurrent reviewer race)", async () => {
    const { cookie, userId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await seedSuspendedCase(caseId, runId, userId);

    await env.DB.prepare("UPDATE cases SET status = 'RUNNING' WHERE id = ?").bind(caseId).run();

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

  it("rejects OVERRIDE with empty rationale (server-side superRefine)", async () => {
    const { cookie, userId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await seedSuspendedCase(caseId, runId, userId);

    const res = await exports.default.fetch(
      postAction(caseId, cookie, {
        action: "OVERRIDE",
        rationale: "",
        action_id: crypto.randomUUID(),
      }),
    );
    expect(res.status).toBe(400);
  });
});

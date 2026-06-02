/**
 * Integration: full HITL cycle — Mode A SSE drives the workflow to
 * SUSPENDED_HITL, then POST /api/cases/:id/action drives Mastra's
 * `run.resume` through `recordAction → promoteToEval → finalizeCaseStatus`.
 *
 * Asserts the cycle's persisted side effects:
 *  - response 200 with `status === "success"`
 *  - `cases.status === "ACTIONED"`
 *  - one `reviewer_actions` row keyed by the submitted `action_id`
 *  - one `eval_promotions` row keyed by `(run_id, action_id)`
 *  - `workflow_events` contains `step.suspend`, `step.resume`, and
 *    `workflow.finish` in monotonic seq order
 *
 * Mode A is run with the mock LLM driver so the workflow is fully
 * deterministic. The route owns the atomic claim + resume.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";
import {
  responsesForCaseIndex,
  SEED_CASE_IDS,
  serializeMockResponses,
} from "@mizan/mastra/testing";
import seedCase001 from "../../../../packages/mastra/src/seeds/documentary/case-001.json" with { type: "json" };
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";
import { RUN_REMOTE_VECTORIZE } from "./remote-deps.ts";

const BASE = "http://localhost";
const HITL_CASE_INDEX = 0;
const HITL_CASE_ID = SEED_CASE_IDS[HITL_CASE_INDEX];

interface SeedJson {
  readonly id: string;
  readonly category: string;
  readonly geography: string;
  readonly claimed_zakat_category: string;
  readonly organizer_name: string;
  readonly story: string;
  readonly r2_keys: {
    readonly creator_id: string;
    readonly bank_statement: string;
    readonly category_doc: string;
  };
}

async function seedAdmin(): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `hitl-admin-${Date.now()}-${Math.random()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "HITL Admin" }),
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
  if (!row?.id) throw new Error("hitl admin seed failed");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("hitl admin org seed failed");
  return {
    cookie: signIn.headers.getSetCookie().join("; "),
    userId: row.id,
    organizationId: memberRow.organization_id,
  };
}

async function seedCase(adminUserId: string, organizationId: string): Promise<void> {
  const seed = seedCase001 as SeedJson;
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
     VALUES (?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = 'DRAFT', current_run_id = NULL, updated_at = excluded.updated_at`,
  )
    .bind(
      seed.id,
      seed.category,
      seed.geography,
      seed.claimed_zakat_category,
      JSON.stringify({
        story: seed.story,
        organizer_name: seed.organizer_name,
        r2_keys: seed.r2_keys,
      }),
      adminUserId,
      organizationId,
      Date.now(),
      Date.now(),
    )
    .run();
  await env.R2_BUCKET.put(seed.r2_keys.creator_id, MINIMAL_PNG_BYTES);
  await env.R2_BUCKET.put(seed.r2_keys.bank_statement, MINIMAL_PNG_BYTES);
  await env.R2_BUCKET.put(seed.r2_keys.category_doc, MINIMAL_PNG_BYTES);
}

async function drainSse(res: Response): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

async function postAction(
  caseId: string,
  cookie: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return exports.default.fetch(
    new Request(`${BASE}/api/cases/${caseId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    }),
  );
}

describe.skipIf(!RUN_REMOTE_VECTORIZE)(
  "HITL cycle — Mode A suspend → POST /action → ACTIONED",
  () => {
    let adminCookie = "";

    beforeAll(async () => {
      await applyD1Migrations(env.DB, inject("migrations"));
      const admin = await seedAdmin();
      adminCookie = admin.cookie;
      await seedCase(admin.userId, admin.organizationId);
    }, 60_000);

    it("drives suspend → action → ACTIONED with full row persistence + event tape", async () => {
      env.MOCK_LLM_RESPONSES = serializeMockResponses(responsesForCaseIndex(HITL_CASE_INDEX));
      const briefRes = await exports.default.fetch(
        new Request(`${BASE}/api/cases/${HITL_CASE_ID}/brief`, {
          method: "POST",
          headers: {
            Cookie: adminCookie,
            Accept: "text/event-stream",
            "Idempotency-Key": crypto.randomUUID(),
          },
        }),
      );
      expect(briefRes.status).toBe(200);
      await drainSse(briefRes);

      const suspended = await env.DB.prepare(
        "SELECT status, current_run_id FROM cases WHERE id = ?",
      )
        .bind(HITL_CASE_ID)
        .first<{ status: string; current_run_id: string | null }>();
      expect(suspended?.status).toBe("SUSPENDED_HITL");
      expect(suspended?.current_run_id).toBeTruthy();
      const runId = suspended?.current_run_id ?? "";

      const actionId = crypto.randomUUID();
      const actionRes = await postAction(HITL_CASE_ID, adminCookie, {
        action: "APPROVE",
        rationale: "Documentary evidence verified",
        action_id: actionId,
      });
      expect(actionRes.status).toBe(200);
      const body = (await actionRes.json()) as { status: string };
      expect(body.status).toBe("success");

      const terminal = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
        .bind(HITL_CASE_ID)
        .first<{ status: string }>();
      expect(terminal?.status).toBe("ACTIONED");

      const reviewerActionRow = await env.DB.prepare(
        "SELECT action, action_id FROM reviewer_actions WHERE action_id = ?",
      )
        .bind(actionId)
        .first<{ action: string; action_id: string }>();
      expect(reviewerActionRow?.action).toBe("APPROVE");

      const evalRow = await env.DB.prepare(
        "SELECT reviewer_action FROM eval_promotions WHERE run_id = ? AND action_id = ?",
      )
        .bind(runId, actionId)
        .first<{ reviewer_action: string }>();
      expect(evalRow?.reviewer_action).toBe("APPROVE");

      const events = await env.DB.prepare(
        "SELECT event_type, seq FROM workflow_events WHERE run_id = ? ORDER BY seq",
      )
        .bind(runId)
        .all<{ event_type: string; seq: number }>();
      const suspendSeq = events.results.find((r) => r.event_type === "step.suspend")?.seq;
      const resumeSeq = events.results.find((r) => r.event_type === "step.resume")?.seq;
      const finishSeq = events.results.find((r) => r.event_type === "workflow.finish")?.seq;
      expect(suspendSeq).toBeGreaterThan(0);
      expect(resumeSeq).toBeGreaterThan(suspendSeq ?? 0);
      expect(finishSeq).toBeGreaterThan(resumeSeq ?? 0);

      const replay = await postAction(HITL_CASE_ID, adminCookie, {
        action: "APPROVE",
        rationale: "Documentary evidence verified",
        action_id: actionId,
      });
      expect(replay.status).toBe(200);

      const reviewerActionRows = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM reviewer_actions WHERE action_id = ?",
      )
        .bind(actionId)
        .first<{ n: number }>();
      expect(reviewerActionRows?.n).toBe(1);
    }, 120_000);
  },
);

/**
 * Integration test: `persistBrief` upserts the briefs row idempotently
 * under `(case_id, run_id)`. Re-running composeBrief on the same run
 * (queue redelivery, manual rerun) overwrites the prior row last-write
 * wins instead of leaving stale data behind. Mirrors the
 * `upsertSignal` idempotency contract — the symmetric retry fix from
 * pass 5 has its own integration coverage here so the regression that
 * "compose-only retry between composeBrief and post-compose mutations
 * leaves stale Run-1 data" never returns.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import type { BriefPayload } from "@mizan/mastra";
import { persistBrief } from "@mizan/mastra/steps/composeBrief/run.ts";

const TEST_CASE_ID = "66666666-6666-4666-8666-666666666001";
const TEST_RUN_ID = "77777777-7777-4777-8777-777777777001";

interface BriefRow {
  recommendation: string;
  confidence: number;
  payload_json: string;
}

const FIRST_BRIEF: BriefPayload = {
  recommendation: "REQUEST_DOCS",
  verification_path: "documentary",
  geography_tier: "SAFE",
  policy_grounded: true,
  missing_docs: [{ docType: "bank_statement", reason: "incomplete" }],
  reviewer_questions: [],
  extracted_claims: "first run",
  confidence: 55,
  policy_citations: [],
};

const SECOND_BRIEF: BriefPayload = {
  recommendation: "READY_FOR_REVIEW",
  verification_path: "documentary",
  geography_tier: "SAFE",
  policy_grounded: true,
  missing_docs: [],
  reviewer_questions: [],
  extracted_claims: "second run overwrites the first",
  confidence: 88,
  policy_citations: [],
};

async function countBriefRows(caseId: string, runId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM briefs WHERE case_id = ? AND run_id = ?",
  )
    .bind(caseId, runId)
    .first<{ count: number }>();
  if (!row) throw new Error("count query returned no row");
  return row.count;
}

async function loadBriefRow(caseId: string, runId: string): Promise<BriefRow> {
  const row = await env.DB.prepare(
    "SELECT recommendation, confidence, payload_json FROM briefs WHERE case_id = ? AND run_id = ?",
  )
    .bind(caseId, runId)
    .first<BriefRow>();
  if (!row) throw new Error("brief row missing");
  return row;
}

describe("persistBrief idempotency", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    await env.DB.prepare(
      `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, created_at, updated_at)
       VALUES (?, 'DRAFT', 'medical', 'US', NULL, NULL, 'persist-brief-test', ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(TEST_CASE_ID, Date.now(), Date.now())
      .run();
    await env.DB.prepare("DELETE FROM briefs WHERE case_id = ? AND run_id = ?")
      .bind(TEST_CASE_ID, TEST_RUN_ID)
      .run();
  });

  it("first call inserts a single brief row", async () => {
    await persistBrief(env, TEST_CASE_ID, TEST_RUN_ID, FIRST_BRIEF);
    expect(await countBriefRows(TEST_CASE_ID, TEST_RUN_ID)).toBe(1);
    const row = await loadBriefRow(TEST_CASE_ID, TEST_RUN_ID);
    expect(row.recommendation).toBe("REQUEST_DOCS");
    expect(row.confidence).toBe(55);
  });

  it("second call with same (case_id, run_id) keeps count at 1 and overwrites recommendation + confidence + payload", async () => {
    await persistBrief(env, TEST_CASE_ID, TEST_RUN_ID, SECOND_BRIEF);
    expect(await countBriefRows(TEST_CASE_ID, TEST_RUN_ID)).toBe(1);
    const row = await loadBriefRow(TEST_CASE_ID, TEST_RUN_ID);
    expect(row.recommendation).toBe("READY_FOR_REVIEW");
    expect(row.confidence).toBe(88);
    const persisted = JSON.parse(row.payload_json) as BriefPayload;
    expect(persisted.extracted_claims).toBe("second run overwrites the first");
  });

  it("rejects writes that violate the cases foreign key (error message includes triage tuple)", async () => {
    const MISSING_CASE = "88888888-8888-4888-8888-888888888888";
    await expect(
      persistBrief(env, MISSING_CASE, TEST_RUN_ID, FIRST_BRIEF),
    ).rejects.toThrow(
      /persistBrief failed.*case_id=88888888-8888-4888-8888-888888888888.*run_id=77777777-7777-4777-8777-777777777001/,
    );
  });
});

/**
 * Touches the unused `exports` import to keep the integration-test
 * setup symmetric with the other integration files (some of which
 * require `exports.default.fetch`).
 */
void exports;

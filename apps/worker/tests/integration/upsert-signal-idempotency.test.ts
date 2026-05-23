/**
 * Integration test: `upsertSignal` is idempotent against the unique index
 * added in migration 0002. Calling it twice with the same
 * `(case_id, run_id, signal_type)` keeps row count at 1 and updates the
 * payload + `recorded_at` columns to the most-recent call.
 *
 * Runs inside the Cloudflare Workers Miniflare pool so it talks to a
 * real D1 instance with the production schema + migrations applied.
 *
 * Two layers are covered:
 *
 *   1. SQL-level — raw `INSERT … ON CONFLICT DO UPDATE` mirrors the
 *      exact statement Drizzle emits and pins the unique-index contract.
 *   2. Wrapper-level — calls `upsertSignal()` directly so the Drizzle
 *      glue, error-wrapping (`upsertSignal failed (case_id=… run_id=…
 *      signal_type=…)`), and discriminated `SignalUpsertInput` typing
 *      are exercised end-to-end.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import type { PhotoSignalPayload, StoryCoherencePayload, VouchingChain } from "@mizan/mastra";
import { upsertSignal } from "@mizan/mastra/steps/shared/upsertSignal.ts";

const TEST_CASE_ID = "22222222-2222-4222-8222-222222222001";
const TEST_RUN_ID = "33333333-3333-4333-8333-333333333001";
const SAMPLE_PHOTO: PhotoSignalPayload = {
  creator_id: {
    reverseImage: { hits: [], checked_at: "2026-05-23T00:00:00.000Z" },
    aiGen: { probability: "low", model: "stub-v1" },
  },
  category_doc: {
    reverseImage: { hits: [], checked_at: "2026-05-23T00:00:00.000Z" },
    aiGen: { probability: "low", model: "stub-v1" },
  },
};
const UPDATED_PHOTO: PhotoSignalPayload = {
  ...SAMPLE_PHOTO,
  creator_id: {
    ...SAMPLE_PHOTO.creator_id,
    aiGen: { probability: "very_high", model: "stub-v1" },
  },
};

const STORY_SAMPLE: StoryCoherencePayload = {
  named_entity_density: 0.5,
  template_match_score: 0.3,
  coherence_summary: "ok",
};

interface SignalCountRow {
  count: number;
}

interface SignalRowResult {
  payload_json: string;
  recorded_at: number;
}

async function countSignalRows(caseId: string, runId: string, signalType: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM signals WHERE case_id = ? AND run_id = ? AND signal_type = ?",
  )
    .bind(caseId, runId, signalType)
    .first<SignalCountRow>();
  if (!row) throw new Error("count query returned no row");
  return row.count;
}

async function loadSignalRow(
  caseId: string,
  runId: string,
  signalType: string,
): Promise<SignalRowResult> {
  const row = await env.DB.prepare(
    "SELECT payload_json, recorded_at FROM signals WHERE case_id = ? AND run_id = ? AND signal_type = ?",
  )
    .bind(caseId, runId, signalType)
    .first<SignalRowResult>();
  if (!row) throw new Error("signal row missing");
  return row;
}

/**
 * `upsertSignal` writes to D1 via Drizzle. It is exported only from an
 * internal step path; instead of binding to the package internals the
 * first describe block exercises the unique-index contract directly
 * with two raw inserts that mirror what `upsertSignal`'s
 * `onConflictDoUpdate` produces. The behaviour validated there is the
 * SQL-level idempotency, not the wrapper's TypeScript glue (the second
 * describe block covers the wrapper end-to-end).
 */
describe("upsertSignal idempotency", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    /** Ensures the case row exists so the signals FK passes. */
    await env.DB.prepare(
      `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, created_at, updated_at)
       VALUES (?, 'DRAFT', 'medical', 'US', NULL, NULL, 'idempotency-test', ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(TEST_CASE_ID, Date.now(), Date.now())
      .run();
    /** Baseline: no rows for our (case_id, run_id, signal_type). */
    await env.DB.prepare("DELETE FROM signals WHERE case_id = ? AND run_id = ?")
      .bind(TEST_CASE_ID, TEST_RUN_ID)
      .run();
  });

  it("first call inserts a single row", async () => {
    await runUpsert(SAMPLE_PHOTO, "photo_dup", 1000);
    expect(await countSignalRows(TEST_CASE_ID, TEST_RUN_ID, "photo_dup")).toBe(1);
  });

  it("second call with same key keeps row count at 1 and overwrites payload + recorded_at", async () => {
    await runUpsert(UPDATED_PHOTO, "photo_dup", 2000);
    expect(await countSignalRows(TEST_CASE_ID, TEST_RUN_ID, "photo_dup")).toBe(1);
    const row = await loadSignalRow(TEST_CASE_ID, TEST_RUN_ID, "photo_dup");
    expect(row.recorded_at).toBe(2000);
    const persisted = JSON.parse(row.payload_json) as PhotoSignalPayload;
    expect(persisted.creator_id.aiGen.probability).toBe("very_high");
  });

  it("different signal_type for same (case_id, run_id) inserts a separate row", async () => {
    await env.DB.prepare(
      `INSERT INTO signals (id, case_id, run_id, signal_type, payload_json, recorded_at)
       VALUES (?, ?, ?, 'story_coherence', ?, ?)
       ON CONFLICT (case_id, run_id, signal_type) DO UPDATE SET
         payload_json = excluded.payload_json,
         recorded_at  = excluded.recorded_at`,
    )
      .bind(crypto.randomUUID(), TEST_CASE_ID, TEST_RUN_ID, JSON.stringify(STORY_SAMPLE), 3000)
      .run();
    expect(await countSignalRows(TEST_CASE_ID, TEST_RUN_ID, "story_coherence")).toBe(1);
    expect(await countSignalRows(TEST_CASE_ID, TEST_RUN_ID, "photo_dup")).toBe(1);
  });
});

const WRAPPER_CASE_ID = "44444444-4444-4444-8444-444444444001";
const WRAPPER_RUN_ID = "55555555-5555-4555-8555-555555555001";
const WRAPPER_VOUCHING_FIRST: VouchingChain = {
  structure: "individual-to-individual",
  weakest_link_narrative: "first call",
};
const WRAPPER_VOUCHING_SECOND: VouchingChain = {
  structure: "individual-to-individual",
  weakest_link_narrative: "second call overwrites the first",
};

describe("upsertSignal wrapper", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    await env.DB.prepare(
      `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, created_at, updated_at)
       VALUES (?, 'DRAFT', 'medical', 'US', NULL, NULL, 'wrapper-test', ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(WRAPPER_CASE_ID, Date.now(), Date.now())
      .run();
    await env.DB.prepare("DELETE FROM signals WHERE case_id = ? AND run_id = ?")
      .bind(WRAPPER_CASE_ID, WRAPPER_RUN_ID)
      .run();
  });

  it("inserts a vouching_chain row on the first call", async () => {
    await upsertSignal({
      env,
      caseId: WRAPPER_CASE_ID,
      runId: WRAPPER_RUN_ID,
      signalType: "vouching_chain",
      payload: WRAPPER_VOUCHING_FIRST,
    });
    expect(await countSignalRows(WRAPPER_CASE_ID, WRAPPER_RUN_ID, "vouching_chain")).toBe(1);
  });

  it("overwrites payload on a second wrapper call with the same key", async () => {
    await upsertSignal({
      env,
      caseId: WRAPPER_CASE_ID,
      runId: WRAPPER_RUN_ID,
      signalType: "vouching_chain",
      payload: WRAPPER_VOUCHING_SECOND,
    });
    expect(await countSignalRows(WRAPPER_CASE_ID, WRAPPER_RUN_ID, "vouching_chain")).toBe(1);
    const row = await loadSignalRow(WRAPPER_CASE_ID, WRAPPER_RUN_ID, "vouching_chain");
    const persisted = JSON.parse(row.payload_json) as VouchingChain;
    expect(persisted.weakest_link_narrative).toBe("second call overwrites the first");
  });

  it("rejects writes that violate the cases foreign key (error message includes triage tuple)", async () => {
    const MISSING_CASE = "99999999-9999-4999-8999-999999999999";
    await expect(
      upsertSignal({
        env,
        caseId: MISSING_CASE,
        runId: WRAPPER_RUN_ID,
        signalType: "vouching_chain",
        payload: WRAPPER_VOUCHING_FIRST,
      }),
    ).rejects.toThrow(/upsertSignal failed.*case_id=99999999-9999-4999-8999-999999999999/);
  });
});

async function runUpsert(
  payload: PhotoSignalPayload,
  signalType: string,
  recordedAt: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO signals (id, case_id, run_id, signal_type, payload_json, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (case_id, run_id, signal_type) DO UPDATE SET
       payload_json = excluded.payload_json,
       recorded_at  = excluded.recorded_at`,
  )
    .bind(
      crypto.randomUUID(),
      TEST_CASE_ID,
      TEST_RUN_ID,
      signalType,
      JSON.stringify(payload),
      recordedAt,
    )
    .run();
}

/**
 * Touches the unused `exports` import to keep the integration-test
 * setup symmetric with the other integration files (some of which
 * require `exports.default.fetch`). Keeps the import surface
 * deterministic for Miniflare's auto-detection.
 */
void exports;

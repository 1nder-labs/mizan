/**
 * Integration test: Phase 4 community-vouching workflow paths + signals persistence.
 */

import { readFileSync } from "node:fs";
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { z } from "zod";
import { tierFor } from "@mizan/mastra";
import {
  BriefPayloadSchema,
  PhotoSignalPayloadSchema,
  StoryCoherencePayloadSchema,
  VerificationPathSchema,
  VouchingChainSchema,
  type VerificationPath,
} from "@mizan/shared";
import {
  case006Responses,
  case007Responses,
  case008Responses,
  SeedCaseSchema,
  serializeMockResponses,
} from "@mizan/mastra/testing";
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";

const BASE = "http://localhost";

interface CommunityCaseFixture {
  readonly id: string;
  readonly file: string;
  readonly geography: string;
  readonly responses: () => Record<string, unknown>;
  readonly expectedPath: VerificationPath;
  readonly forcedEscalate: boolean;
  readonly expectsDraftedMessage: boolean;
  readonly expectedRecommendation: "READY_FOR_REVIEW" | "REQUEST_DOCS" | "ESCALATE";
}

const COMMUNITY_CASES: readonly CommunityCaseFixture[] = [
  {
    id: "11111111-1111-4111-8111-111111111106",
    file: "case-006.json",
    geography: "YE",
    responses: case006Responses,
    expectedPath: VerificationPathSchema.parse("community_vouching"),
    forcedEscalate: false,
    expectsDraftedMessage: true,
    expectedRecommendation: "REQUEST_DOCS",
  },
  {
    id: "11111111-1111-4111-8111-111111111107",
    file: "case-007.json",
    geography: "SD",
    responses: case007Responses,
    expectedPath: VerificationPathSchema.parse("institutional_vouching"),
    forcedEscalate: false,
    expectsDraftedMessage: false,
    expectedRecommendation: "READY_FOR_REVIEW",
  },
  {
    id: "11111111-1111-4111-8111-111111111108",
    file: "case-008.json",
    geography: "PS",
    responses: case008Responses,
    expectedPath: VerificationPathSchema.parse("none"),
    forcedEscalate: true,
    expectsDraftedMessage: false,
    expectedRecommendation: "ESCALATE",
  },
];

function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

async function seedAdmin(): Promise<string> {
  const email = `phase4-admin-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Phase4 Admin" }),
    }),
  );
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE email = ?").bind(email).run();
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  return cookiesFrom(signIn);
}

function loadCommunitySeed(filename: string) {
  const path = new URL(
    `../../../../packages/mastra/src/seeds/community-vouching/${filename}`,
    import.meta.url,
  ).pathname;
  return SeedCaseSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

async function drainSse(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

const SignalRowSchema = z.object({
  signal_type: z.enum([
    "photo_dup",
    "story_coherence",
    "vouching_chain",
    "registry_lookup",
    "sanctions_screen",
    "ocr_mismatch",
  ]),
  payload_json: z.string(),
  run_id: z.string(),
});

const BriefRowSchema = z.object({
  payload_json: z.string(),
  run_id: z.string(),
});

describe("phase 4 community-vouching workflow", () => {
  let adminCookie = "";
  let adminUserId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    adminCookie = await seedAdmin();
    const row = await env.DB.prepare(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at DESC LIMIT 1",
    ).first<{ id: string }>();
    if (!row?.id) throw new Error("admin user missing");
    adminUserId = row.id;

    for (const entry of COMMUNITY_CASES) {
      const seed = loadCommunitySeed(entry.file);
      const overlay = {
        story: seed.story,
        organizer_name: seed.organizer_name,
        r2_keys: seed.r2_keys,
        ...(seed.vouching_narrative ? { vouching_narrative: seed.vouching_narrative } : {}),
      };
      await env.DB.prepare(
        `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           brief_partial_json = excluded.brief_partial_json,
           updated_at = excluded.updated_at`,
      )
        .bind(
          seed.id,
          "DRAFT",
          seed.category,
          seed.geography,
          seed.claimed_zakat_category,
          JSON.stringify(overlay),
          adminUserId,
          Date.now(),
          Date.now(),
        )
        .run();

      await env.R2_BUCKET.put(seed.r2_keys.creator_id, MINIMAL_PNG_BYTES);
      await env.R2_BUCKET.put(seed.r2_keys.bank_statement, MINIMAL_PNG_BYTES);
      await env.R2_BUCKET.put(seed.r2_keys.category_doc, MINIMAL_PNG_BYTES);
    }
  }, 60_000);

  it.each(COMMUNITY_CASES.map((entry) => [entry.id, entry] as const))(
    "case %s routes correctly with three signal rows",
    async (caseId, entry) => {
      try {
        await runCommunityCaseAssertions(caseId, entry);
      } finally {
        /**
         * Unconditional teardown — the original reset on the happy path
         * left case rows stuck in RUNNING when any assertion failed,
         * which then poisoned the downstream re-trigger idempotency
         * test (it observed unexpected status rather than the real
         * regression). `try/finally` guarantees the DRAFT reset runs
         * even when expectations fail mid-flight.
         */
        await env.DB.prepare(
          "UPDATE cases SET status = 'DRAFT', current_run_id = NULL WHERE id = ?",
        )
          .bind(caseId)
          .run();
      }
    },
    60_000,
  );

  /** Asserts every contract a community-vouching workflow run must satisfy. */
  async function runCommunityCaseAssertions(
    caseId: string,
    entry: CommunityCaseFixture,
  ): Promise<void> {
    env.MOCK_LLM_RESPONSES = serializeMockResponses(entry.responses());
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/brief`, {
        method: "POST",
        headers: {
          Cookie: adminCookie,
          Accept: "text/event-stream",
          "Idempotency-Key": crypto.randomUUID(),
        },
      }),
    );
    expect(res.status).toBe(200);
    const sse = await drainSse(res);
    assertSseStream(sse);

    const briefRow = await env.DB.prepare(
      "SELECT payload_json, run_id FROM briefs WHERE case_id = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(caseId)
      .first<{ payload_json: string; run_id: string }>();
    if (!briefRow) throw new Error("brief row missing");
    const parsedBriefRow = BriefRowSchema.parse(briefRow);
    const brief = BriefPayloadSchema.parse(JSON.parse(parsedBriefRow.payload_json));

    expect(brief.verification_path).toBe(entry.expectedPath);
    expect(brief.geography_tier).toBe(tierFor(entry.geography));
    /**
     * Recommendation contract (PR test plan items 2/3/4): every
     * community-vouching case has exactly one expected recommendation —
     * REQUEST_DOCS for case-006 (draft path), READY_FOR_REVIEW for
     * case-007 (institutional clean run), ESCALATE for case-008
     * (forced gate fires).
     */
    expect(brief.recommendation).toBe(entry.expectedRecommendation);

    if (entry.forcedEscalate) {
      const reason = brief.forced_escalate_reason ?? "";
      expect(reason.length).toBeGreaterThan(0);
      expect(reason).toContain("verification_path=none");
      expect(reason).toContain("no documentary chain");
      expect(brief.drafted_organizer_message).toBeUndefined();
    } else {
      expect(brief.forced_escalate_reason).toBeUndefined();
    }

    if (entry.expectsDraftedMessage) {
      expect(brief.recommendation).toBe("REQUEST_DOCS");
      expect(brief.drafted_organizer_message?.message.length ?? 0).toBeGreaterThan(0);
      expect((brief.drafted_organizer_message?.missing_items ?? []).length).toBeGreaterThan(0);
    } else if (!entry.forcedEscalate) {
      expect(brief.drafted_organizer_message).toBeUndefined();
    }

    const signalRows = await env.DB.prepare(
      "SELECT signal_type, payload_json, run_id FROM signals WHERE case_id = ? AND run_id = ?",
    )
      .bind(caseId, parsedBriefRow.run_id)
      .all<{ signal_type: string; payload_json: string; run_id: string }>();
    const parsedRows = signalRows.results.map((row) => SignalRowSchema.parse(row));
    expect(parsedRows).toHaveLength(3);
    const types = parsedRows.map((row) => row.signal_type).sort();
    expect(types).toEqual(["photo_dup", "story_coherence", "vouching_chain"]);

    const photoRow = parsedRows.find((row) => row.signal_type === "photo_dup");
    const storyRow = parsedRows.find((row) => row.signal_type === "story_coherence");
    const vouchingRow = parsedRows.find((row) => row.signal_type === "vouching_chain");
    if (!photoRow || !storyRow || !vouchingRow) throw new Error("expected all three signals");

    PhotoSignalPayloadSchema.parse(JSON.parse(photoRow.payload_json));
    StoryCoherencePayloadSchema.parse(JSON.parse(storyRow.payload_json));
    const vouching = VouchingChainSchema.parse(JSON.parse(vouchingRow.payload_json));

    if (entry.expectedPath === "institutional_vouching") {
      if (
        vouching.structure !== "individual-via-partner-org" &&
        vouching.structure !== "org-direct"
      ) {
        throw new Error(`expected partner structure, got ${vouching.structure}`);
      }
      expect(vouching.partner_org_name).toBe("Sudan Aid Foundation");
    } else if (entry.expectedPath === "community_vouching") {
      expect(vouching.structure).toBe("individual-to-individual");
    } else if (entry.expectedPath === "none") {
      expect(vouching.structure).toBe("none");
    }

    /**
     * `finalizeCaseStatus` runs after `forcedEscalateGate` and must
     * flip the case to READY_FOR_REVIEW. Asserting the persisted
     * status (not just the brief) catches a class of bug where the
     * status-transition step is removed or short-circuited — the
     * brief writes succeed but the case stays stuck in RUNNING.
     */
    const statusRow = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(statusRow?.status).toBe("READY_FOR_REVIEW");
  }

  /*
   * PR test plan item 5: migration 0002 adds `signals_case_run_type_uniq`
   * and 0003 drops the older `signals_case_run_idx`. `applyD1Migrations`
   * has already replayed every migration on this D1 by the time this
   * test runs, so the assertion below verifies the END state matches
   * what the migration files describe — an explicit name-level check
   * that complements the behavioural upsert idempotency tests.
   */
  it("D1 schema has signals_case_run_type_uniq and no signals_case_run_idx", async () => {
    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'signals'",
    ).all<{ name: string }>();
    const names = indexes.results.map((row) => row.name);
    expect(names).toContain("signals_case_run_type_uniq");
    expect(names).not.toContain("signals_case_run_idx");
  });

  /*
   * PR test plan item 6: re-trigger the same case after a successful
   * run. Each workflow invocation gets its own `run_id`, so the
   * idempotency contract under test is per-run: every signal upsert
   * inside one run must produce exactly one row for that
   * (case_id, run_id, signal_type) triple. A regression that wrote two
   * signal rows per run (e.g., a step that called `upsertSignal` twice
   * without conflict resolution) would land COUNT=6 here instead of
   * COUNT=3, which the unique-index from migration 0002 actually
   * blocks at the SQL layer — making this test a belt-and-braces guard
   * that wires the contract end-to-end through the live workflow.
   */
  it("re-triggering case-006 produces a fresh run with exactly 3 signal rows", async () => {
    const target = COMMUNITY_CASES[0];
    if (!target) throw new Error("expected case-006 in COMMUNITY_CASES[0]");
    env.MOCK_LLM_RESPONSES = serializeMockResponses(target.responses());
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${target.id}/brief`, {
        method: "POST",
        headers: {
          Cookie: adminCookie,
          Accept: "text/event-stream",
          "Idempotency-Key": crypto.randomUUID(),
        },
      }),
    );
    expect(res.status).toBe(200);
    await drainSse(res);

    const briefRow = await env.DB.prepare(
      "SELECT run_id FROM briefs WHERE case_id = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(target.id)
      .first<{ run_id: string }>();
    if (!briefRow) throw new Error("brief row missing after re-trigger");

    const signalRows = await env.DB.prepare(
      "SELECT signal_type FROM signals WHERE case_id = ? AND run_id = ?",
    )
      .bind(target.id, briefRow.run_id)
      .all<{ signal_type: string }>();
    expect(signalRows.results).toHaveLength(3);
    const types = signalRows.results.map((row) => row.signal_type).sort();
    expect(types).toEqual(["photo_dup", "story_coherence", "vouching_chain"]);
  }, 60_000);
});

/**
 * The brief route emits the AI SDK 6.x UI-message stream protocol via
 * `toAISdkStream` (see `apps/worker/src/routes/cases.ts`). The stream
 * terminates with a `finish` event whose JSON payload is appended last;
 * asserting on the terminal event catches truncated streams that an
 * `sse.length > 0` check would miss.
 */
function assertSseStream(sse: string): void {
  expect(sse.length).toBeGreaterThan(0);
  expect(sse).toMatch(/data:\s*\{/);
  expect(sse).toMatch(/"type"\s*:\s*"finish"/);
}

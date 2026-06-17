/**
 * Integration test: Phase 4 community-vouching workflow paths + signals persistence.
 */

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
  VouchingChainVariantSchema,
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
import { RUN_REMOTE_VECTORIZE } from "./remote-deps.ts";
import { seedDocuments } from "./cases-test-helpers.ts";
import seedCase006Raw from "../../../../packages/mastra/src/seeds/cases/case-006/seed.json" with { type: "json" };
import seedCase007Raw from "../../../../packages/mastra/src/seeds/cases/case-007/seed.json" with { type: "json" };
import seedCase008Raw from "../../../../packages/mastra/src/seeds/cases/case-008/seed.json" with { type: "json" };

const BASE = "http://localhost";

interface CommunityCaseFixture {
  readonly id: string;
  readonly file: string;
  readonly geography: string;
  readonly responses: () => Record<string, unknown>;
  readonly expectedPath: VerificationPath;
  readonly forcedEscalate: boolean;
  readonly expectedRecommendation: "SUSPENDED_HITL" | "REQUEST_DOCS" | "ESCALATE";
  /** Path-specific phrase from `forcedEscalateReason`'s `REASON_BY_PATH` lookup. */
  readonly expectedReasonPhrase: string;
}

const COMMUNITY_CASES: readonly CommunityCaseFixture[] = [
  {
    /** YE = OFAC_ADJACENT, community-vouching → forced ESCALATE (no draft). */
    id: "11111111-1111-4111-8111-111111111106",
    file: "case-006.json",
    geography: "YE",
    responses: case006Responses,
    expectedPath: VerificationPathSchema.parse("community_vouching"),
    forcedEscalate: true,
    expectedRecommendation: "ESCALATE",
    expectedReasonPhrase: "community vouching insufficient",
  },
  {
    /** SD = OFAC, institutional-vouching → forced ESCALATE (no draft). */
    id: "11111111-1111-4111-8111-111111111107",
    file: "case-007.json",
    geography: "SD",
    responses: case007Responses,
    expectedPath: VerificationPathSchema.parse("institutional_vouching"),
    forcedEscalate: true,
    expectedRecommendation: "ESCALATE",
    expectedReasonPhrase: "institutional vouching insufficient",
  },
  {
    id: "11111111-1111-4111-8111-111111111108",
    file: "case-008.json",
    geography: "PS",
    responses: case008Responses,
    expectedPath: VerificationPathSchema.parse("none"),
    forcedEscalate: true,
    expectedRecommendation: "ESCALATE",
    expectedReasonPhrase: "no vouching chain available",
  },
];

function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().join("; ");
}

async function seedAdmin(): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `phase4-admin-${Date.now()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Phase4 Admin" }),
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
  if (!row?.id) throw new Error("phase4 admin seed failed");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("phase4 admin org seed failed");
  return { cookie: cookiesFrom(signIn), userId: row.id, organizationId: memberRow.organization_id };
}

const COMMUNITY_SEED_CACHE: Record<string, ReturnType<typeof SeedCaseSchema.parse>> = {
  "case-006.json": SeedCaseSchema.parse(seedCase006Raw),
  "case-007.json": SeedCaseSchema.parse(seedCase007Raw),
  "case-008.json": SeedCaseSchema.parse(seedCase008Raw),
};

function loadCommunitySeed(filename: string): ReturnType<typeof SeedCaseSchema.parse> {
  const cached = COMMUNITY_SEED_CACHE[filename];
  if (!cached) throw new Error(`No preloaded community seed for ${filename}.`);
  return cached;
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
  let adminOrgId = "";

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const admin = await seedAdmin();
    adminCookie = admin.cookie;
    adminUserId = admin.userId;
    adminOrgId = admin.organizationId;

    for (const entry of COMMUNITY_CASES) {
      const seed = loadCommunitySeed(entry.file);
      const overlay = {
        story: seed.story,
        organizer_name: seed.organizer_name,
        ...(seed.vouching_narrative ? { vouching_narrative: seed.vouching_narrative } : {}),
      };
      await env.DB.prepare(
        `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, organization_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          adminOrgId,
          Date.now(),
          Date.now(),
        )
        .run();

      await env.R2_BUCKET.put(seed.r2_keys.creator_id, MINIMAL_PNG_BYTES);
      await env.R2_BUCKET.put(seed.r2_keys.bank_statement, MINIMAL_PNG_BYTES);
      await env.R2_BUCKET.put(seed.r2_keys.category_doc, MINIMAL_PNG_BYTES);
      await seedDocuments({ caseId: seed.id, organizationId: adminOrgId, keys: seed.r2_keys });
    }
  }, 60_000);

  it.skipIf(!RUN_REMOTE_VECTORIZE).each(COMMUNITY_CASES.map((entry) => [entry.id, entry] as const))(
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
      "SELECT payload_json, run_id FROM briefs WHERE case_id = ? ORDER BY composed_at DESC LIMIT 1",
    )
      .bind(caseId)
      .first<{ payload_json: string; run_id: string }>();
    if (!briefRow) throw new Error("brief row missing");
    const parsedBriefRow = BriefRowSchema.parse(briefRow);
    const brief = BriefPayloadSchema.parse(JSON.parse(parsedBriefRow.payload_json));

    expect(brief.verification_path).toBe(entry.expectedPath);
    expect(brief.geography_tier).toBe(tierFor(entry.geography));
    /**
     * Recommendation contract: under the canonical forced-escalate
     * rule every non-SAFE tier escalates non-documentary paths, so all
     * three community-vouching fixtures (YE / SD / PS) terminate at
     * ESCALATE. Documentary fixtures (case-001..005) stay
     * SUSPENDED_HITL per `brief-workflow.test.ts`.
     */
    expect(brief.recommendation).toBe(entry.expectedRecommendation);

    if (entry.forcedEscalate) {
      const reason = brief.forced_escalate_reason ?? "";
      expect(reason.length).toBeGreaterThan(0);
      expect(reason).toContain(`verification_path=${entry.expectedPath}`);
      expect(reason).toContain(`geography_tier=${tierFor(entry.geography)}`);
      expect(reason).toContain(entry.geography);
      expect(reason).toContain(entry.expectedReasonPhrase);
      expect(brief.drafted_organizer_message).toBeUndefined();
    } else {
      expect(brief.forced_escalate_reason).toBeUndefined();
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
    const vouching = VouchingChainVariantSchema.parse(JSON.parse(vouchingRow.payload_json));

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
     * flip the case to SUSPENDED_HITL. Asserting the persisted
     * status (not just the brief) catches a class of bug where the
     * status-transition step is removed or short-circuited — the
     * brief writes succeed but the case stays stuck in RUNNING.
     */
    const statusRow = await env.DB.prepare("SELECT status FROM cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(statusRow?.status).toBe("SUSPENDED_HITL");
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
   * PR test plan item 6: re-trigger after a successful run. Each run
   * gets its own `run_id`; the per-run contract is exactly one signal
   * row per (case_id, run_id, signal_type). A double-write regression
   * would land COUNT=6 not COUNT=3 — which migration 0002's unique
   * index blocks at the SQL layer, so this guards it end-to-end.
   */
  it.skipIf(!RUN_REMOTE_VECTORIZE)(
    "re-triggering case-006 produces a fresh run with exactly 3 signal rows",
    async () => {
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
        "SELECT run_id FROM briefs WHERE case_id = ? ORDER BY composed_at DESC LIMIT 1",
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
    },
    60_000,
  );
});

/** Asserts the SSE stream contains at least one data event and a terminal finish event. */
function assertSseStream(sse: string): void {
  expect(sse.length).toBeGreaterThan(0);
  expect(sse).toMatch(/data:\s*\{/);
  expect(sse).toMatch(/"type"\s*:\s*"finish"/);
}

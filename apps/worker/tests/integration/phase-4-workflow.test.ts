/**
 * Integration test: Phase 4 community-vouching workflow paths + signals persistence.
 */

import { readFileSync } from "node:fs";
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { z } from "zod";
import {
  BriefPayloadSchema,
  PhotoSignalPayloadSchema,
  SeedCaseSchema,
  StoryCoherencePayloadSchema,
  VerificationPathSchema,
  VouchingChainSchema,
} from "@mizan/mastra";
import type { VerificationPath } from "@mizan/mastra";
import {
  case006Responses,
  case007Responses,
  case008Responses,
  serializeMockResponses,
} from "@mizan/mastra/testing";
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";

const BASE = "http://localhost";

interface CommunityCaseFixture {
  readonly id: string;
  readonly file: string;
  readonly responses: () => Record<string, unknown>;
  readonly expectedPath: VerificationPath;
  readonly forcedEscalate: boolean;
}

const COMMUNITY_CASES: readonly CommunityCaseFixture[] = [
  {
    id: "11111111-1111-4111-8111-111111111106",
    file: "case-006.json",
    responses: case006Responses,
    expectedPath: VerificationPathSchema.parse("community_vouching"),
    forcedEscalate: false,
  },
  {
    id: "11111111-1111-4111-8111-111111111107",
    file: "case-007.json",
    responses: case007Responses,
    expectedPath: VerificationPathSchema.parse("institutional_vouching"),
    forcedEscalate: false,
  },
  {
    id: "11111111-1111-4111-8111-111111111108",
    file: "case-008.json",
    responses: case008Responses,
    expectedPath: VerificationPathSchema.parse("none"),
    forcedEscalate: true,
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
      expect(sse.length).toBeGreaterThan(0);

      const briefRow = await env.DB.prepare(
        "SELECT payload_json FROM briefs WHERE case_id = ? ORDER BY created_at DESC LIMIT 1",
      )
        .bind(caseId)
        .first<{ payload_json: string }>();
      expect(briefRow).toBeTruthy();
      const briefPayload = briefRow?.payload_json ?? "{}";
      const brief = BriefPayloadSchema.parse(JSON.parse(briefPayload));

      if (entry.forcedEscalate) {
        expect(brief.recommendation).toBe("ESCALATE");
        expect(brief.forced_escalate_reason?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(brief.recommendation).not.toBe("ESCALATE");
        expect(brief.forced_escalate_reason).toBeUndefined();
      }

      const signalRows = await env.DB.prepare(
        "SELECT signal_type, payload_json FROM signals WHERE case_id = ?",
      )
        .bind(caseId)
        .all<{ signal_type: string; payload_json: string }>();
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

      await env.DB.prepare("UPDATE cases SET status = 'DRAFT', current_run_id = NULL WHERE id = ?")
        .bind(caseId)
        .run();
    },
    60_000,
  );
});

/**
 * Integration test: Phase 4 community-vouching workflow paths + signals persistence.
 */

import { readFileSync } from "node:fs";
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import {
  BriefPayloadSchema,
  case006Responses,
  case007Responses,
  case008Responses,
  serializeMockResponses,
} from "@mizan/mastra";
import type { CloudflareBindings } from "../../src/env.ts";
import { MINIMAL_PNG_BYTES } from "../fixtures/minimal-png.ts";

const BASE = "http://localhost";

const COMMUNITY_CASES = [
  {
    id: "11111111-1111-4111-8111-111111111106",
    file: "case-006.json",
    responses: case006Responses,
    expectedPath: "community_vouching",
    forcedEscalate: false,
  },
  {
    id: "11111111-1111-4111-8111-111111111107",
    file: "case-007.json",
    responses: case007Responses,
    expectedPath: "institutional_vouching",
    forcedEscalate: false,
  },
  {
    id: "11111111-1111-4111-8111-111111111108",
    file: "case-008.json",
    responses: case008Responses,
    expectedPath: "none",
    forcedEscalate: true,
  },
] as const;

interface SeedJson {
  readonly id: string;
  readonly status: string;
  readonly category: string;
  readonly geography: string;
  readonly claimed_zakat_category: string;
  readonly organizer_name: string;
  readonly story: string;
  readonly vouching_narrative?: string;
  readonly r2_keys: {
    readonly creator_id: string;
    readonly bank_statement: string;
    readonly category_doc: string;
  };
}

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

async function loadCommunitySeed(filename: string): Promise<SeedJson> {
  const path = new URL(
    `../../../../packages/mastra/src/seeds/community-vouching/${filename}`,
    import.meta.url,
  ).pathname;
  return JSON.parse(readFileSync(path, "utf8")) as SeedJson;
}

function workerEnv(): CloudflareBindings {
  return env as CloudflareBindings;
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
      const seed = await loadCommunitySeed(entry.file);
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
      workerEnv().MOCK_LLM_RESPONSES = serializeMockResponses(entry.responses());
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
        "SELECT recommendation, payload_json FROM briefs WHERE case_id = ? ORDER BY created_at DESC LIMIT 1",
      )
        .bind(caseId)
        .first<{ recommendation: string; payload_json: string }>();
      expect(briefRow).toBeTruthy();
      const brief = BriefPayloadSchema.parse(JSON.parse(briefRow?.payload_json ?? "{}"));

      if (entry.forcedEscalate) {
        expect(brief.recommendation).toBe("ESCALATE");
        expect(brief.forced_escalate_reason?.length).toBeGreaterThan(0);
      } else {
        expect(brief.recommendation).not.toBe("ESCALATE");
      }

      const signalRows = await env.DB.prepare(
        "SELECT signal_type, payload_json FROM signals WHERE case_id = ?",
      )
        .bind(caseId)
        .all<{ signal_type: string; payload_json: string }>();
      expect(signalRows.results).toHaveLength(3);
      const types = signalRows.results.map((row) => row.signal_type).sort();
      expect(types).toEqual(["photo_dup", "story_coherence", "vouching_chain"]);

      if (entry.expectedPath === "institutional_vouching") {
        const vouchingRow = signalRows.results.find((row) => row.signal_type === "vouching_chain");
        expect(vouchingRow).toBeTruthy();
        const payload = JSON.parse(vouchingRow?.payload_json ?? "{}") as {
          partner_org_name?: string;
        };
        expect(payload.partner_org_name).toBe("Sudan Aid Foundation");
      }

      await env.DB.prepare("UPDATE cases SET status = 'DRAFT', current_run_id = NULL WHERE id = ?")
        .bind(caseId)
        .run();
    },
    60_000,
  );
});

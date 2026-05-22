import { BriefPayloadSchema, case001Responses, case008Responses, resolveLanguageModel } from "@mizan/mastra";
import type { CloudflareBindings } from "@mizan/worker/env";
import type {
  D1Database,
  Fetcher,
  KVNamespace,
  Queue,
  R2Bucket,
  VectorizeIndex,
} from "@cloudflare/workers-types";
import { generateObject } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const SmokeSchema = z.object({ ok: z.literal(true) });

function evalEnv(apiKey: string): CloudflareBindings {
  return {
    DB: {} as D1Database,
    KV: {} as KVNamespace,
    R2_BUCKET: {} as R2Bucket,
    VECTORIZE: {} as VectorizeIndex,
    BRIEF_QUEUE: {} as Queue,
    ASSETS: {} as Fetcher,
    DEFAULT_LLM_PROVIDER: "anthropic",
    LANGFUSE_HOST: "",
    ANTHROPIC_API_KEY: apiKey,
  };
}

describe("smoke-001 eval", () => {
  it.skipIf(!process.env["ANTHROPIC_API_KEY"])(
    "anthropic provider returns structured output",
    async () => {
      const apiKey = process.env["ANTHROPIC_API_KEY"];
      if (!apiKey) {
        console.log("ANTHROPIC_API_KEY not set, skipping smoke eval");
        return;
      }
      const resolved = resolveLanguageModel({
        env: evalEnv(apiKey),
        kind: "extract",
        override: { provider: "anthropic", model: "claude-haiku-4-5" },
      });
      const { object } = await generateObject({
        model: resolved.model,
        schema: SmokeSchema,
        prompt: 'Reply with JSON {"ok": true}',
      });
      expect(object.ok).toBe(true);
    },
    60_000,
  );

  it("case-001 canned brief satisfies policy citation contract", () => {
    const compose = case001Responses()["composeBrief.compose"];
    const brief = BriefPayloadSchema.parse(compose);
    expect(brief.policy_citations.length).toBeGreaterThanOrEqual(2);
    expect(brief.policy_citations.every((citation) => citation.clauseId.length > 0)).toBe(true);
  });

  it("case-008 canned brief forces escalate shape when gate applies", () => {
    const compose = case008Responses()["composeBrief.compose"];
    const brief = BriefPayloadSchema.parse(compose);
    expect(brief.recommendation).toBe("READY_FOR_REVIEW");
    const forced = {
      ...brief,
      recommendation: "ESCALATE" as const,
      forced_escalate_reason: "verification_path=none + geography_tier=OFAC_ADJACENT",
    };
    const parsed = BriefPayloadSchema.parse(forced);
    expect(parsed.recommendation).toBe("ESCALATE");
    expect(parsed.forced_escalate_reason?.length).toBeGreaterThan(0);
  });
});

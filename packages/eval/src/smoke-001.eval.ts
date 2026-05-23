import {
  BriefPayloadSchema,
  forceEscalate,
  resolveLanguageModel,
  VerificationPathSchema,
  GeographyTierSchema,
} from "@mizan/mastra";
import { case001Responses, case008Responses } from "@mizan/mastra/testing";
import type { CloudflareBindings } from "@mizan/worker/env";
import type {
  D1Database,
  Fetcher,
  KVNamespace,
  Queue,
  R2Bucket,
  VectorizeIndex,
} from "@cloudflare/workers-types";
import { generateText, Output } from "ai";
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

describe("smoke-001 live provider", () => {
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
      const result = await generateText({
        model: resolved.model,
        output: Output.object({ schema: SmokeSchema, name: "smoke-001.ok" }),
        prompt: 'Reply with JSON {"ok": true}',
      });
      expect(result.output.ok).toBe(true);
    },
    60_000,
  );
});

describe("smoke-001 canned brief contracts", () => {
  it("case-001 canned brief LLM output is shape-compatible with persisted BriefPayload", () => {
    const compose = case001Responses()["composeBrief.compose"];
    const persisted = BriefPayloadSchema.parse({
      ...(compose as Record<string, unknown>),
      verification_path: VerificationPathSchema.parse("documentary"),
      geography_tier: GeographyTierSchema.parse("SAFE"),
      policy_grounded: true,
    });
    expect(persisted.policy_citations.length).toBeGreaterThanOrEqual(2);
    expect(persisted.policy_citations.every((citation) => citation.clauseId.length > 0)).toBe(true);
  });

  it("case-008 canned brief triggers the forceEscalate predicate without manual mutation", () => {
    const compose = case008Responses()["composeBrief.compose"];
    const persisted = BriefPayloadSchema.parse({
      ...(compose as Record<string, unknown>),
      verification_path: VerificationPathSchema.parse("none"),
      geography_tier: GeographyTierSchema.parse("OFAC_ADJACENT"),
      policy_grounded: true,
    });
    expect(persisted.recommendation).toBe("READY_FOR_REVIEW");
    expect(
      forceEscalate({
        recommendation: persisted.recommendation,
        verification_path: persisted.verification_path,
        geography_tier: persisted.geography_tier,
      }),
    ).toBe(true);
  });
});

/**
 * Smoke eval against real Anthropic — skipped when ANTHROPIC_API_KEY is unset.
 * Validates provider factory + generateObject against live API (~$0.001/call).
 */

import { getModel } from "@mizan/mastra";
import type { CloudflareBindings } from "@mizan/worker/env";
import { generateObject } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const SmokeSchema = z.object({ ok: z.literal(true) });

function evalEnv(apiKey: string): CloudflareBindings {
  return {
    DB: {} as CloudflareBindings["DB"],
    KV: {} as CloudflareBindings["KV"],
    R2_BUCKET: {} as CloudflareBindings["R2_BUCKET"],
    VECTORIZE: {} as CloudflareBindings["VECTORIZE"],
    BRIEF_QUEUE: {} as CloudflareBindings["BRIEF_QUEUE"],
    ASSETS: {} as CloudflareBindings["ASSETS"],
    DEFAULT_LLM_PROVIDER: "anthropic",
    DEFAULT_LLM_MODEL: "claude-opus-4-7",
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
      const model = getModel({ provider: "anthropic", model: "claude-haiku-4-5" }, evalEnv(apiKey));
      const { object } = await generateObject({
        model,
        schema: SmokeSchema,
        prompt: 'Reply with JSON {"ok": true}',
      });
      expect(object.ok).toBe(true);
    },
    60_000,
  );
});

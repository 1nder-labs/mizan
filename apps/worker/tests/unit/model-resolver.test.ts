import { describe, expect, it } from "bun:test";
import { resolveLanguageModel } from "@mizan/mastra";
import type { CloudflareBindings } from "../../src/env.ts";

function makeEnv(overrides: Partial<CloudflareBindings> = {}): CloudflareBindings {
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
    ...overrides,
  };
}

describe("resolveLanguageModel", () => {
  it("returns mock model when MOCK_LLM_RESPONSES is set", () => {
    const map = JSON.stringify({ default: { ok: true } });
    const env = makeEnv({ MOCK_LLM_RESPONSES: map, ANTHROPIC_API_KEY: "test-key" });
    const resolved = resolveLanguageModel({ env, kind: "extract" });
    expect(resolved.model.provider).toBe("mock");
    expect(resolved.model.modelId).toBe("mock-llm");
  });

  it("returns real provider model when no mock env is set", () => {
    const env = makeEnv({ ANTHROPIC_API_KEY: "test-key" });
    const resolved = resolveLanguageModel({ env, kind: "extract" });
    expect(resolved.model.provider).toMatch(/^anthropic/);
    expect(resolved.config.provider).toBe("anthropic");
  });

  it("honours override when present", () => {
    const env = makeEnv({ OPENAI_API_KEY: "test-key" });
    const resolved = resolveLanguageModel({
      env,
      kind: "extract",
      override: { provider: "openai", model: "gpt-4o-mini" },
    });
    expect(resolved.config.provider).toBe("openai");
    expect(resolved.config.model).toBe("gpt-4o-mini");
  });

  it("throws when no provider key is available", () => {
    const env = makeEnv();
    expect(() => resolveLanguageModel({ env, kind: "extract" })).toThrow("no LLM provider");
  });
});

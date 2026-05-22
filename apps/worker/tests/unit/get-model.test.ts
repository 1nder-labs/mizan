import { describe, expect, it } from "bun:test";
import { getModel } from "@mizan/mastra";
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

describe("getModel", () => {
  it("returns anthropic model for anthropic provider", () => {
    const model = getModel(
      { provider: "anthropic", model: "claude-haiku-4-5" },
      makeEnv({ ANTHROPIC_API_KEY: "test-key" }),
    );
    expect(model.provider).toMatch(/^anthropic/);
  });

  it("returns openai model for openai provider", () => {
    const model = getModel(
      { provider: "openai", model: "gpt-4o-mini" },
      makeEnv({ OPENAI_API_KEY: "test-key" }),
    );
    expect(model.provider).toMatch(/^openai/);
  });

  it("throws when openrouter is selected without API key", () => {
    expect(() =>
      getModel({ provider: "openrouter", model: "anthropic/claude-haiku-4-5" }, makeEnv()),
    ).toThrow("OPENROUTER_API_KEY");
  });
});

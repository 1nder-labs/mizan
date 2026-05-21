import { describe, expect, it } from "vitest";
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
  it("short-circuits to mock provider when MOCK_LLM_RESPONSES is set", () => {
    const map = JSON.stringify({
      default: { ok: true },
      "extractCreatorIdDoc.extract": {
        document_type: "passport",
        full_name: "Test",
        document_number_redacted: "****1",
        issuing_country_iso: "US",
        issue_date_iso: null,
        expiry_date_iso: null,
        matches_organizer_name: true,
        confidence: 50,
      },
    });
    const model = getModel(
      { provider: "anthropic", model: "claude-haiku-4-5" },
      makeEnv({ MOCK_LLM_RESPONSES: map }),
    );
    expect(model.provider).toBe("mock");
    expect(model.modelId).toBe("mock-llm");
  });

  it("returns anthropic model when no mock env is set", () => {
    const model = getModel(
      { provider: "anthropic", model: "claude-haiku-4-5" },
      makeEnv({ ANTHROPIC_API_KEY: "test-key" }),
    );
    expect(model.provider).toMatch(/^anthropic/);
  });

  it("throws when openrouter is selected without API key", () => {
    expect(() =>
      getModel({ provider: "openrouter", model: "anthropic/claude-haiku-4-5" }, makeEnv()),
    ).toThrow("OPENROUTER_API_KEY");
  });
});

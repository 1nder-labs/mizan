import { describe, expect, it } from "bun:test";
import { resolveLanguageModel } from "@mizan/mastra";
import "@mizan/mastra/testing";
import { makeStubBindings } from "../helpers/test-bindings.ts";

describe("resolveLanguageModel", () => {
  it("returns mock model when MOCK_LLM_RESPONSES is set", () => {
    const map = JSON.stringify({ default: { ok: true } });
    const env = makeStubBindings({ MOCK_LLM_RESPONSES: map });
    const resolved = resolveLanguageModel({ env, kind: "extract" });
    expect(resolved.model.provider).toBe("mock");
    expect(resolved.model.modelId).toBe("mock-llm");
  });

  it("mock short-circuit does not require an API key", () => {
    const env = makeStubBindings({ MOCK_LLM_RESPONSES: JSON.stringify({ default: {} }) });
    expect(() => resolveLanguageModel({ env, kind: "extract" })).not.toThrow();
  });

  it("returns real provider model when no mock env is set", () => {
    const env = makeStubBindings({ ANTHROPIC_API_KEY: "test-key" });
    const resolved = resolveLanguageModel({ env, kind: "extract" });
    expect(resolved.model.provider).toMatch(/^anthropic/);
    expect(resolved.config.provider).toBe("anthropic");
  });

  it("honours override when present", () => {
    const env = makeStubBindings({ OPENAI_API_KEY: "test-key" });
    const resolved = resolveLanguageModel({
      env,
      kind: "extract",
      override: { provider: "openai", model: "gpt-4o-mini" },
    });
    expect(resolved.config.provider).toBe("openai");
    expect(resolved.config.model).toBe("gpt-4o-mini");
  });

  it("throws when no provider key is available", () => {
    const env = makeStubBindings();
    expect(() => resolveLanguageModel({ env, kind: "extract" })).toThrow("no LLM provider");
  });
});

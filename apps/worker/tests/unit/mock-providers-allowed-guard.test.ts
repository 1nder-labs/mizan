import { describe, expect, it } from "bun:test";
import "@mizan/mastra/testing";
import { resolveLanguageModel } from "@mizan/mastra";
import type { CloudflareBindings } from "@mizan/shared";
import { makeStubBindings } from "@mizan/shared/testing";

/**
 * Production fail-closed contract: even if a stray
 * `MOCK_LLM_RESPONSES` value reaches the worker env, the mock branch
 * stays closed unless `MOCK_PROVIDERS_ALLOWED === "1"` is also set.
 * Tests opt in via `makeStubBindings`; production wrangler.jsonc never
 * sets either flag. These tests pin the contract negatively — without
 * the guard the resolver would try the real provider path and a
 * missing API key would surface, but the SDN-list / billing risk of
 * unintentional mock replay would be gone.
 */
describe("mock providers fail-closed guard", () => {
  /**
   * Returns `true` when `resolveLanguageModel` selected the mock
   * branch. The mock's `LanguageModelV3` returns a synthetic provider
   * id we can check; the real `withMastra` wrapper preserves the
   * `provider` config so a `mock-llm` model name confirms the mock
   * branch fired.
   */
  function resolvedMock(env: CloudflareBindings): boolean {
    const { config } = resolveLanguageModel({ env, kind: "extract" });
    return config.model === "mock-llm";
  }

  it("enters mock branch when MOCK_PROVIDERS_ALLOWED + MOCK_LLM_RESPONSES are set", () => {
    const env = makeStubBindings({
      MOCK_PROVIDERS_ALLOWED: "1",
      MOCK_LLM_RESPONSES: JSON.stringify({}),
    });
    expect(resolvedMock(env)).toBe(true);
  });

  it("skips mock branch when MOCK_PROVIDERS_ALLOWED is unset (prod-like env)", () => {
    const env = makeStubBindings({
      ANTHROPIC_API_KEY: "test-key",
      MOCK_LLM_RESPONSES: JSON.stringify({}),
    });
    delete env.MOCK_PROVIDERS_ALLOWED;
    expect(resolvedMock(env)).toBe(false);
  });

  it("skips mock branch when MOCK_PROVIDERS_ALLOWED is set to anything other than '1'", () => {
    const env = makeStubBindings({
      ANTHROPIC_API_KEY: "test-key",
      MOCK_PROVIDERS_ALLOWED: "true",
      MOCK_LLM_RESPONSES: JSON.stringify({}),
    });
    expect(resolvedMock(env)).toBe(false);
  });

  it("skips mock branch when MOCK_LLM_RESPONSES is unset even with the allow flag", () => {
    const env = makeStubBindings({
      ANTHROPIC_API_KEY: "test-key",
      MOCK_PROVIDERS_ALLOWED: "1",
    });
    delete env.MOCK_LLM_RESPONSES;
    expect(resolvedMock(env)).toBe(false);
  });
});

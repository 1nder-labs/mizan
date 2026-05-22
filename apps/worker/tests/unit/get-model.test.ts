import { describe, expect, it } from "bun:test";
import { getModel } from "@mizan/mastra";
import { makeStubBindings } from "../helpers/test-bindings.ts";

describe("getModel", () => {
  it("returns anthropic model for anthropic provider", () => {
    const model = getModel(
      { provider: "anthropic", model: "claude-haiku-4-5" },
      makeStubBindings({ ANTHROPIC_API_KEY: "test-key" }),
    );
    expect(model.provider).toMatch(/^anthropic/);
  });

  it("returns openai model for openai provider", () => {
    const model = getModel(
      { provider: "openai", model: "gpt-4o-mini" },
      makeStubBindings({ OPENAI_API_KEY: "test-key" }),
    );
    expect(model.provider).toMatch(/^openai/);
  });

  it("throws when openrouter is selected without API key", () => {
    expect(() =>
      getModel({ provider: "openrouter", model: "anthropic/claude-haiku-4-5" }, makeStubBindings()),
    ).toThrow("OPENROUTER_API_KEY");
  });
});

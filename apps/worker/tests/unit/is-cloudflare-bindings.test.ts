import { describe, expect, it } from "bun:test";
import { isCloudflareBindings } from "@mizan/mastra/testing";
import { makeStubBindings } from "@mizan/shared/testing";

/**
 * `isCloudflareBindings` runs at every workflow-step boundary to
 * narrow `RequestContext.get(MIZAN_ENV_KEY)` from `unknown` to
 * `CloudflareBindings`. A regression that loosens this guard would let
 * a step crash deep inside a persistence path on `cannot read 'put' of
 * undefined`; these tests pin every required-field check.
 */
describe("isCloudflareBindings", () => {
  it("accepts a fully-populated stub", () => {
    expect(isCloudflareBindings(makeStubBindings())).toBe(true);
  });

  it("rejects null", () => {
    expect(isCloudflareBindings(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isCloudflareBindings(undefined)).toBe(false);
  });

  it("rejects a primitive", () => {
    expect(isCloudflareBindings("not-an-object")).toBe(false);
    expect(isCloudflareBindings(42)).toBe(false);
  });

  const BINDING_KEYS = ["DB", "KV", "R2_BUCKET", "VECTORIZE", "BRIEF_QUEUE", "ASSETS"] as const;
  for (const key of BINDING_KEYS) {
    it(`rejects bindings missing required handle ${key}`, () => {
      const bindings = makeStubBindings();
      const broken: Record<string, unknown> = { ...bindings };
      delete broken[key];
      expect(isCloudflareBindings(broken)).toBe(false);
    });

    it(`rejects bindings where ${key} is not an object`, () => {
      const broken = makeStubBindings();
      const mutated: Record<string, unknown> = { ...broken, [key]: "not-an-object" };
      expect(isCloudflareBindings(mutated)).toBe(false);
    });
  }

  it("rejects bindings missing required string env DEFAULT_LLM_PROVIDER", () => {
    const broken: Record<string, unknown> = { ...makeStubBindings() };
    delete broken["DEFAULT_LLM_PROVIDER"];
    expect(isCloudflareBindings(broken)).toBe(false);
  });

  it("rejects bindings where DEFAULT_LLM_PROVIDER is not a string", () => {
    const broken: Record<string, unknown> = { ...makeStubBindings(), DEFAULT_LLM_PROVIDER: 42 };
    expect(isCloudflareBindings(broken)).toBe(false);
  });

  it("rejects bindings missing required string env LANGFUSE_HOST", () => {
    const broken: Record<string, unknown> = { ...makeStubBindings() };
    delete broken["LANGFUSE_HOST"];
    expect(isCloudflareBindings(broken)).toBe(false);
  });

  it("rejects bindings where LANGFUSE_HOST is not a string", () => {
    const broken: Record<string, unknown> = { ...makeStubBindings(), LANGFUSE_HOST: null };
    expect(isCloudflareBindings(broken)).toBe(false);
  });

  it("accepts an empty LANGFUSE_HOST string (production may omit Langfuse)", () => {
    const env = makeStubBindings({ LANGFUSE_HOST: "" });
    expect(isCloudflareBindings(env)).toBe(true);
  });
});

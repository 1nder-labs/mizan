import { afterEach, describe, expect, it } from "bun:test";
import {
  __resetTestProvidersForTesting,
  installDefaultMockProviders,
  registerTestProviders,
} from "@mizan/mastra/testing";

/**
 * The mock-provider registry on `model-resolver.ts` is module-private
 * state — necessary because production code must not import the test
 * scaffolding. Two contracts protect it:
 *
 *   1. A second `registerTestProviders` call throws — divergent mock
 *      registrations between two test bootstraps cannot silently
 *      overwrite each other.
 *   2. The `__resetTestProvidersForTesting` escape hatch exists ONLY
 *      for tests that need to re-register a different mock per case.
 *
 * Each test resets + re-installs the default mocks in `afterEach` so
 * subsequent tests in the same bun worker still see the default
 * mock-provider behaviour every other test relies on.
 */
describe("registerTestProviders one-shot contract", () => {
  afterEach(() => {
    __resetTestProvidersForTesting();
    installDefaultMockProviders();
  });

  it("throws on a second call without an explicit reset", () => {
    __resetTestProvidersForTesting();
    registerTestProviders({});
    expect(() => registerTestProviders({})).toThrow(
      /test providers already registered.*import @mizan\/mastra\/testing exactly once per process/,
    );
  });

  it("__resetTestProvidersForTesting clears the freeze so a follow-up registration is accepted", () => {
    __resetTestProvidersForTesting();
    registerTestProviders({});
    __resetTestProvidersForTesting();
    expect(() => registerTestProviders({})).not.toThrow();
  });
});

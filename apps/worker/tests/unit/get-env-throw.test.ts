import { describe, expect, it } from "bun:test";
import "@mizan/mastra/testing";
import { getEnv, MIZAN_ENV_KEY } from "@mizan/mastra";
import type { CloudflareBindings } from "@mizan/shared";
import { makeStubBindings } from "@mizan/shared/testing";

/**
 * `getEnv` throws when the Mastra `RequestContext` is missing the
 * `MIZAN_ENV_KEY` slot or carries a malformed value. The unit test for
 * `isCloudflareBindings` covers the validation predicate directly;
 * this file covers the request-boundary throw so a regression that
 * loosened the guard cannot ship without breaking a test.
 *
 * Avoids the `@mastra/core` package dependency by using a minimal
 * `RequestContext`-shaped stub — `getEnv` only calls `.get(...)`, so
 * the structural type is sufficient.
 */
interface RequestContextLike {
  get(key: string): unknown;
}

function makeRc(slot: Record<string, unknown>): RequestContextLike {
  return {
    get: (key: string) => slot[key],
  };
}

describe("getEnv", () => {
  it("returns the validated bindings when the runtime context has a complete env slot", () => {
    const env: CloudflareBindings = makeStubBindings();
    const rc = makeRc({ [MIZAN_ENV_KEY]: env });
    const resolved = getEnv(rc as never);
    expect(resolved).toBe(env);
  });

  it("throws when the runtime context has no env slot", () => {
    const rc = makeRc({});
    expect(() => getEnv(rc as never)).toThrow(/missing Cloudflare bindings/);
  });

  it("throws when the env slot is set but the value is not an object", () => {
    const rc = makeRc({ [MIZAN_ENV_KEY]: "not-an-object" });
    expect(() => getEnv(rc as never)).toThrow(/missing Cloudflare bindings/);
  });

  it("throws when required handles are missing from the env slot", () => {
    const broken: Record<string, unknown> = { ...makeStubBindings() };
    delete broken["KV"];
    const rc = makeRc({ [MIZAN_ENV_KEY]: broken });
    expect(() => getEnv(rc as never)).toThrow(/missing Cloudflare bindings/);
  });

  it("throws when required string env fields are missing", () => {
    const broken: Record<string, unknown> = { ...makeStubBindings() };
    delete broken["DEFAULT_LLM_PROVIDER"];
    const rc = makeRc({ [MIZAN_ENV_KEY]: broken });
    expect(() => getEnv(rc as never)).toThrow(/missing Cloudflare bindings/);
  });
});

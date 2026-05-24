/**
 * Verifies that `apiMutate` (the production export) injects a fresh
 * `Idempotency-Key` UUID on every call and that `api` (the production
 * export) sends none.
 *
 * Both clients are built via the `createApi` / `createApiMutate`
 * factories `rpc.ts` exports — the same code path the production
 * singletons take, just with a capturing `fetch` injected so we can
 * observe the outbound headers without patching `globalThis.fetch`.
 */
import { describe, expect, test } from "bun:test";
import { api, apiMutate, createApi, createApiMutate } from "../../src/lib/rpc.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function captureFetch(): {
  readonly captured: Headers[];
  readonly fetch: typeof globalThis.fetch;
} {
  const captured: Headers[] = [];
  const fetchImpl: typeof globalThis.fetch = (_input, init) => {
    captured.push(new Headers(init?.headers));
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
  };
  return { captured, fetch: fetchImpl };
}

describe("rpc client exports", () => {
  test("singletons exist", () => {
    expect(api).not.toBeUndefined();
    expect(apiMutate).not.toBeUndefined();
  });

  test("apiMutate injects unique Idempotency-Key on every call", async () => {
    const { captured, fetch: fetchImpl } = captureFetch();
    const mutate = createApiMutate({ fetch: fetchImpl });

    await mutate.cases.$get({ query: { page: "1", sort: "updated_desc" } }).catch(() => {});
    await mutate.cases.$get({ query: { page: "1", sort: "updated_desc" } }).catch(() => {});

    expect(captured).toHaveLength(2);
    const key1 = captured[0]?.get("Idempotency-Key");
    const key2 = captured[1]?.get("Idempotency-Key");
    expect(key1).toMatch(UUID_RE);
    expect(key2).toMatch(UUID_RE);
    expect(key1).not.toBe(key2);
  });

  test("api sends no Idempotency-Key", async () => {
    const { captured, fetch: fetchImpl } = captureFetch();
    const read = createApi({ fetch: fetchImpl });

    await read.cases.$get({ query: { page: "1", sort: "updated_desc" } }).catch(() => {});

    expect(captured).toHaveLength(1);
    expect(captured[0]?.get("Idempotency-Key")).toBeNull();
  });
});

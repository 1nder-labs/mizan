/**
 * Verifies that `apiMutate` injects a fresh `Idempotency-Key` UUID on every
 * call and that the read-only `api` client sends no such header.
 *
 * Uses the `fetch` option of `hc()` to capture outbound requests without
 * patching `globalThis.fetch` (hono captures `fetch` at instantiation time,
 * so global patching after-the-fact is unreliable).
 */
import { describe, expect, test } from "bun:test";
import { hc } from "hono/client";
import type { AppType } from "@mizan/shared";
import { api, apiMutate } from "../../src/lib/rpc.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeCapturingFetch(): { capturedHeaders: Headers[]; fetch: typeof globalThis.fetch } {
  const capturedHeaders: Headers[] = [];
  const captureFetch: typeof globalThis.fetch = (_input, init) => {
    capturedHeaders.push(new Headers(init?.headers));
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
  };
  return { capturedHeaders, fetch: captureFetch };
}

describe("apiMutate vs api header behaviour", () => {
  test("exported api and apiMutate clients exist", () => {
    expect(api).not.toBeUndefined();
    expect(apiMutate).not.toBeUndefined();
  });

  test("a local hc client with headers fn injects a unique Idempotency-Key on every call", async () => {
    const { capturedHeaders, fetch: captureFetch } = makeCapturingFetch();

    const mutateClient = hc<AppType>("/api", {
      headers: () => ({ "Idempotency-Key": crypto.randomUUID() }),
      fetch: captureFetch,
    });

    await mutateClient.cases.$get({ query: { page: "1", sort: "updated_desc" } }).catch(() => {});
    await mutateClient.cases.$get({ query: { page: "1", sort: "updated_desc" } }).catch(() => {});

    expect(capturedHeaders).toHaveLength(2);

    const key1 = capturedHeaders[0]?.get("Idempotency-Key");
    const key2 = capturedHeaders[1]?.get("Idempotency-Key");

    expect(key1).toMatch(UUID_RE);
    expect(key2).toMatch(UUID_RE);
    expect(key1).not.toBe(key2);
  });

  test("a plain hc client (no headers fn) sends no Idempotency-Key header", async () => {
    const { capturedHeaders, fetch: captureFetch } = makeCapturingFetch();

    const readClient = hc<AppType>("/api", { fetch: captureFetch });

    await readClient.cases.$get({ query: { page: "1", sort: "updated_desc" } }).catch(() => {});

    expect(capturedHeaders).toHaveLength(1);
    expect(capturedHeaders[0]?.get("Idempotency-Key")).toBeNull();
  });
});

/**
 * Unit tests for the `idempotencyKey` middleware.
 *
 * The middleware needs only `c.env.KV`, so a minimal Hono app is assembled
 * with a mock KV that records calls to `get` and `put`. The real
 * `idempotencyKey` middleware is mounted directly — no worker stack required.
 *
 * KV interface is mocked with `vi.fn()` per the plan specification.
 * The fake env is passed as the second argument to `honoApp.fetch()`.
 *
 * Test cases:
 * 1. GET request passes through without touching KV.
 * 2. POST without `Idempotency-Key` header passes through without touching KV.
 * 3. POST with key + cache MISS → handler runs, KV.put called after response.
 * 4. POST with key + cache HIT → returns cached body with Idempotency-Replay header,
 *    handler NOT called.
 * 5. POST with non-JSON response → response returned normally, no KV.put call.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { idempotencyKey } from "../../src/middleware/idempotency-key.ts";

/** Minimal KV mock interface covering only the methods used by `idempotencyKey`. */
interface MockKV {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

function makeMockKV(): MockKV {
  return {
    get: vi.fn(),
    put: vi.fn(),
  };
}

/** Builds a tiny Hono app that exercises the middleware under test. */
function makeApp(kv: MockKV, handleFn: () => Response) {
  const fakeEnv = { KV: kv };
  const app = new Hono<{ Bindings: { KV: typeof kv } }>()
    .use("*", idempotencyKey)
    .all("/test", () => handleFn());

  return {
    fetch: (req: Request) => app.fetch(req, fakeEnv),
  };
}

describe("idempotencyKey middleware", () => {
  let kv: MockKV;

  beforeEach(() => {
    kv = makeMockKV();
  });

  it("passes GET requests through without touching KV", async () => {
    const handler = vi.fn(
      () =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { fetch } = makeApp(kv, handler);
    const res = await fetch(new Request("http://localhost/test", { method: "GET" }));
    expect(res.status).toBe(200);
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("passes POST without Idempotency-Key header through without touching KV", async () => {
    const handler = vi.fn(
      () =>
        new Response(JSON.stringify({ done: true }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { fetch } = makeApp(kv, handler);
    const res = await fetch(new Request("http://localhost/test", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("cache MISS: handler runs and KV.put is called after the response", async () => {
    kv.get.mockResolvedValueOnce(null);
    kv.put.mockResolvedValue(undefined);
    const handler = vi.fn(
      () =>
        new Response(JSON.stringify({ result: "fresh" }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { fetch } = makeApp(kv, handler);
    const res = await fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Idempotency-Key": "key-abc-123" },
      }),
    );
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(kv.get).toHaveBeenCalledWith("idem:key-abc-123", "json");
    expect(kv.put).toHaveBeenCalledOnce();
    const putArgs = kv.put.mock.calls[0] as [string, string, { expirationTtl: number }];
    expect(putArgs[0]).toBe("idem:key-abc-123");
    const stored = JSON.parse(putArgs[1]);
    expect(stored).toMatchObject({ status: 200, body: { result: "fresh" } });
  });

  it("cache HIT: returns cached body with Idempotency-Replay header, handler NOT called", async () => {
    const cachedPayload = { status: 200, body: { result: "cached" }, headers: {} };
    kv.get.mockResolvedValueOnce(cachedPayload);
    const handler = vi.fn(
      () =>
        new Response(JSON.stringify({ result: "fresh" }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { fetch } = makeApp(kv, handler);
    const res = await fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Idempotency-Key": "key-hit-456" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Idempotency-Replay")).toBe("true");
    const body = await res.json();
    expect(body).toEqual({ result: "cached" });
    expect(handler).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("non-JSON response: response returned normally, KV.put NOT called", async () => {
    kv.get.mockResolvedValueOnce(null);
    kv.put.mockResolvedValue(undefined);
    const handler = vi.fn(
      () =>
        new Response("plain text body", {
          headers: { "Content-Type": "text/plain" },
        }),
    );
    const { fetch } = makeApp(kv, handler);
    const res = await fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Idempotency-Key": "key-nonjson-789" },
      }),
    );
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("non-2xx response (4xx validation error): NOT cached per PRD §7.10", async () => {
    kv.get.mockResolvedValueOnce(null);
    kv.put.mockResolvedValue(undefined);
    const handler = vi.fn(
      () =>
        new Response(JSON.stringify({ error: "bad input" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { fetch } = makeApp(kv, handler);
    const res = await fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Idempotency-Key": "key-400-abc" },
      }),
    );
    expect(res.status).toBe(400);
    expect(handler).toHaveBeenCalledOnce();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("non-2xx response (5xx server error): NOT cached", async () => {
    kv.get.mockResolvedValueOnce(null);
    kv.put.mockResolvedValue(undefined);
    const handler = vi.fn(
      () =>
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { fetch } = makeApp(kv, handler);
    const res = await fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Idempotency-Key": "key-500-xyz" },
      }),
    );
    expect(res.status).toBe(500);
    expect(handler).toHaveBeenCalledOnce();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("malformed KV payload (missing required field): treated as cache miss, handler runs", async () => {
    kv.get.mockResolvedValueOnce({ status: 200 });
    kv.put.mockResolvedValue(undefined);
    const handler = vi.fn(
      () =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { fetch } = makeApp(kv, handler);
    const res = await fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Idempotency-Key": "key-malformed-def" },
      }),
    );
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(res.headers.get("Idempotency-Replay")).toBeNull();
  });
});

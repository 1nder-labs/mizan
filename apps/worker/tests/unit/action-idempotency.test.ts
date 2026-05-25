/**
 * Unit tests for Layer 4 action idempotency middleware.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { actionIdempotency } from "../../src/middleware/action-idempotency.ts";

interface MockKV {
  get: ReturnType<typeof mock>;
  put: ReturnType<typeof mock>;
}

function makeMockKV(): MockKV {
  return {
    get: mock(),
    put: mock(),
  };
}

const ACTION_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeApp(kv: MockKV, handler: () => Response) {
  const fakeEnv = { KV: kv };
  const app = new Hono<{ Bindings: { KV: typeof kv }; Variables: { user: { id: string } } }>()
    .use("*", async (c, next) => {
      c.set("user", { id: "reviewer-1" });
      await next();
    })
    .use("*", actionIdempotency)
    .post("/action", handler);

  return {
    fetch: (req: Request) => app.fetch(req, fakeEnv),
  };
}

describe("actionIdempotency middleware", () => {
  let kv: MockKV;

  beforeEach(() => {
    kv = makeMockKV();
  });

  it("returns cached body when the same reviewer replays action_id", async () => {
    const cachedBody = {
      status: "success",
      brief: null,
      action: { action: "APPROVE", rationale: "", action_id: ACTION_ID },
    };
    kv.get.mockResolvedValueOnce({ status: 200, body: cachedBody });
    const handler = mock(() => new Response("should not run"));
    const { fetch } = makeApp(kv, handler);

    const res = await fetch(
      new Request("http://localhost/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE",
          rationale: "",
          action_id: ACTION_ID,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toEqual(cachedBody);
    expect(handler).not.toHaveBeenCalled();
    expect(kv.get).toHaveBeenCalledWith(`idem:action:reviewer-1:${ACTION_ID}`, "json");
  });

  it("passes through on cache miss", async () => {
    kv.get.mockResolvedValueOnce(null);
    const handler = mock(
      () =>
        new Response(JSON.stringify({ status: "success" }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { fetch } = makeApp(kv, handler);

    const res = await fetch(
      new Request("http://localhost/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE",
          rationale: "",
          action_id: ACTION_ID,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

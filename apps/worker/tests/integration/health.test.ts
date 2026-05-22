import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../../src/index.ts";

describe("GET /health", () => {
  it("returns 200 with expected JSON body (unit style — direct worker.fetch)", async () => {
    const ctx = createExecutionContext();
    const req = new Request("http://localhost/health");
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      runtime: "cloudflare-workers",
    });
    expect(body).toHaveProperty("bindings");
    expect(body).toEqual(
      expect.objectContaining({
        bindings: expect.arrayContaining([
          "DB",
          "R2_BUCKET",
          "VECTORIZE",
          "KV",
          "BRIEF_QUEUE",
          "ASSETS",
        ]),
      }),
    );
  });

  it("returns 200 (integration style — exports.default.fetch)", async () => {
    const res = await exports.default.fetch("http://localhost/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        status: "ok",
        runtime: "cloudflare-workers",
        bindings: expect.arrayContaining([
          "DB",
          "R2_BUCKET",
          "VECTORIZE",
          "KV",
          "BRIEF_QUEUE",
          "ASSETS",
        ]),
      }),
    );
  });

  it("every Cloudflare binding is defined in env", () => {
    expect(env.DB).toBeDefined();
    expect(env.R2_BUCKET).toBeDefined();
    expect(env.VECTORIZE).toBeDefined();
    expect(env.KV).toBeDefined();
    expect(env.BRIEF_QUEUE).toBeDefined();
    expect(env.ASSETS).toBeDefined();
    expect(env.DEFAULT_LLM_PROVIDER).toBe("anthropic");
    expect(env.LANGFUSE_HOST).toBe("");
  });
});

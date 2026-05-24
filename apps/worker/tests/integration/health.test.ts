import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../../src/index.ts";

describe("GET /health", () => {
  it("returns 200 with minimal JSON body (unit style — direct worker.fetch)", async () => {
    const ctx = createExecutionContext();
    const req = new Request("http://localhost/health");
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
    expect(body).not.toHaveProperty("bindings");
    expect(body).not.toHaveProperty("runtime");
  });

  it("returns 200 with minimal JSON body (integration style — exports.default.fetch)", async () => {
    const res = await exports.default.fetch("http://localhost/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
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

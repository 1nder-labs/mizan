/**
 * Langfuse E2E trace verification — LOCAL-ONLY, CI-excluded.
 *
 * Points at a managed Langfuse Cloud project (or any Langfuse v3 host).
 * Set the credentials in the environment, run a brief via `wrangler dev`,
 * then run:
 *   RUN_LANGFUSE_E2E=1 \
 *   LANGFUSE_HOST=https://us.cloud.langfuse.com \
 *   LANGFUSE_PUBLIC_KEY=pk-... LANGFUSE_SECRET_KEY=sk-... \
 *   bun --filter @mizan/worker test:integration
 *
 * Asserts a recent brief run produced a trace carrying token cost, the
 * organizationId dimension, and a sessionId for HITL linkage.
 */
import { describe, expect, it } from "vitest";
import { RUN_LANGFUSE_E2E } from "./remote-deps.ts";

const LANGFUSE_HOST = process.env.LANGFUSE_HOST ?? "";
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY ?? "";
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY ?? "";

const HAS_CREDS = Boolean(LANGFUSE_HOST && LANGFUSE_PUBLIC_KEY && LANGFUSE_SECRET_KEY);

function langfuseAuth(): string {
  return `Basic ${Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64")}`;
}

async function fetchTraces(params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${LANGFUSE_HOST}/api/public/traces?${query}`, {
    headers: { Authorization: langfuseAuth() },
  });
  if (!res.ok) throw new Error(`Langfuse traces fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

describe.runIf(RUN_LANGFUSE_E2E && HAS_CREDS)("Langfuse E2E trace verification", () => {
  it("keys authenticate against the API", async () => {
    const res = await fetch(`${LANGFUSE_HOST}/api/public/traces?limit=1`, {
      headers: { Authorization: langfuseAuth() },
    });
    expect(res.ok).toBe(true);
  });

  it("a recent brief trace carries token cost", async () => {
    const data = (await fetchTraces({ limit: "5" })) as {
      data: Array<{ id: string; metadata: Record<string, unknown>; totalCost: number }>;
    };
    expect(data.data.length).toBeGreaterThan(0);
    const trace = data.data[0]!;
    expect(trace.metadata).toHaveProperty("caseId");
    expect(trace.metadata).toHaveProperty("runId");
    expect(trace.totalCost).toBeGreaterThan(0);
  });

  it("traces carry organizationId metadata", async () => {
    const data = (await fetchTraces({ limit: "1" })) as {
      data: Array<{ metadata: Record<string, unknown> }>;
    };
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data[0]!.metadata).toHaveProperty("organizationId");
  });

  it("a brief trace carries a sessionId for HITL linkage", async () => {
    const data = (await fetchTraces({ limit: "1" })) as {
      data: Array<{ sessionId: string | null }>;
    };
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data[0]!.sessionId).toBeTruthy();
  });
});

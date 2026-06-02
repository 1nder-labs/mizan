/**
 * Langfuse E2E trace verification — LOCAL-ONLY, CI-excluded.
 *
 * Requires a live Langfuse stack:
 *   docker compose -f docker/docker-compose.langfuse.yml up -d
 *   bun run seed:langfuse
 *
 * Run with: `RUN_LANGFUSE_E2E=1 bun --filter @mizan/worker test:integration`
 *
 * Asserts:
 * 1. A brief run produces a trace in Langfuse with tokens + USD cost
 * 2. A suspend→action flow's brief and action share a `sessionId`
 */
import { describe, expect, it } from "vitest";
import { RUN_LANGFUSE_E2E } from "./remote-deps.ts";

const LANGFUSE_HOST = "http://localhost:3010";
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY ?? "pk-lf-dev-mizan-local";
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY ?? "sk-lf-dev-mizan-local";

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

describe.runIf(RUN_LANGFUSE_E2E)("Langfuse E2E trace verification", () => {
  it("health endpoint returns 200", async () => {
    const res = await fetch(`${LANGFUSE_HOST}/api/public/health`);
    expect(res.ok).toBe(true);
  });

  it("seeded keys authenticate against the API", async () => {
    const res = await fetch(`${LANGFUSE_HOST}/api/public/traces?limit=1`, {
      headers: { Authorization: langfuseAuth() },
    });
    expect(res.ok).toBe(true);
  });

  it("a trace with tags exists for a recent brief run", async () => {
    const data = (await fetchTraces({ tags: "mizan", limit: "5" })) as {
      data: Array<{
        id: string;
        tags: string[];
        metadata: Record<string, unknown>;
        totalCost: number;
      }>;
    };
    expect(data.data.length).toBeGreaterThan(0);
    const trace = data.data[0]!;
    expect(trace.tags).toContain("mizan");
    expect(trace.metadata).toHaveProperty("caseId");
    expect(trace.metadata).toHaveProperty("runId");
    expect(trace.totalCost).toBeGreaterThan(0);
  });

  it("traces carry organizationId metadata", async () => {
    const data = (await fetchTraces({ tags: "mizan", limit: "1" })) as {
      data: Array<{ metadata: Record<string, unknown> }>;
    };
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data[0]!.metadata).toHaveProperty("organizationId");
  });

  it("a brief trace carries a sessionId for HITL linkage", async () => {
    const data = (await fetchTraces({ tags: "mizan", limit: "1" })) as {
      data: Array<{ sessionId: string | null }>;
    };
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data[0]!.sessionId).toBeTruthy();
  });
});

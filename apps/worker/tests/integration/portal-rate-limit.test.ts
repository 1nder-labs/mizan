/**
 * Integration: the client portal write limiter (PRD Phase 10 finding #8).
 *
 * Proves the KV-backed fixed-window per-user limiter bounds `/api/portal/*`
 * mutations: the first 30 writes in a 60s window pass through to their handler
 * (here a 404 on an unknown id — the cheap path that still costs quota), and
 * the 31st is refused with 429 + `Retry-After`. Read-only requests are never
 * limited. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { BASE, seedReviewOrgWithAdmin, send, signUp } from "./portal-helpers.ts";

const CAMPAIGNS_URL = `${BASE}/api/portal/campaigns`;
const MAX_WRITES_PER_WINDOW = 30;

beforeAll(async () => {
  await applyD1Migrations(env.DB, inject("migrations"));
  const admin = await signUp(`rl-admin-${Date.now()}@test.local`, "RL Admin");
  await seedReviewOrgWithAdmin(admin.userId);
});

describe("portal write rate limit", () => {
  it("allows up to the cap, then 429s further writes in the window", async () => {
    const client = await signUp(`rl-client-${Date.now()}@test.local`, "RL Client", "client");
    const missingId = crypto.randomUUID();

    for (let i = 0; i < MAX_WRITES_PER_WINDOW; i++) {
      const res = await send("DELETE", `${CAMPAIGNS_URL}/${missingId}`, client.cookie);
      expect(res.status).not.toBe(429);
    }

    const limited = await send("DELETE", `${CAMPAIGNS_URL}/${missingId}`, client.cookie);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("never limits read-only requests", async () => {
    const client = await signUp(`rl-reader-${Date.now()}@test.local`, "RL Reader", "client");
    for (let i = 0; i < MAX_WRITES_PER_WINDOW + 5; i++) {
      const res = await send("GET", CAMPAIGNS_URL, client.cookie);
      expect(res.status).toBe(200);
    }
  });
});

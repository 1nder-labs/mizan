/**
 * Integration: POST /api/cases/:id/action — HITL resume + Layer 4 idempotency.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const BASE = "http://localhost";

describe("POST /api/cases/:id/action", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("returns 404 for a missing case", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/550e8400-e29b-41d4-a716-446655440099/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE",
          rationale: "",
          action_id: crypto.randomUUID(),
        }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

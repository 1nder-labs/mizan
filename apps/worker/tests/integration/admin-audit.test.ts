/**
 * Integration: GET /api/admin/audit — paginated reviewer-action feed.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const BASE = "http://localhost";

describe("GET /api/admin/audit", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("returns 401 when unauthenticated", async () => {
    const res = await exports.default.fetch(new Request(`${BASE}/api/admin/audit?page=1`));
    expect(res.status).toBe(401);
  });
});

/**
 * Integration test: better-auth rate-limit on /api/auth/sign-in/email.
 *
 * The auth config sets `customRules["/sign-in/email"]: { window: 60, max: 5 }`.
 * This test fires requests with bad credentials until it receives a 429 or
 * exhausts 20 attempts. We break early on the first 429 to keep the test fast.
 *
 * `X-Forwarded-For` and `CF-Connecting-IP` are pinned to a stable IP so all
 * requests bucket the same way in Miniflare's KV-backed rate-limit store.
 *
 * Timeout is set to 30 000 ms to accommodate Miniflare KV latency on slow
 * machines — each sign-in attempt can take ~200–400 ms against a local workerd.
 */

import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const BASE = "http://localhost";
const STABLE_IP = "203.0.113.42";

describe("sign-in rate limit", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("returns at least one 429 after repeated failed sign-in attempts", async () => {
    const results: number[] = [];

    for (let i = 0; i < 20; i++) {
      const res = await exports.default.fetch(
        new Request(`${BASE}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": STABLE_IP,
            "CF-Connecting-IP": STABLE_IP,
          },
          body: JSON.stringify({
            email: "nonexistent@test.local",
            password: "WrongPassword123!",
          }),
        }),
      );
      results.push(res.status);
      if (res.status === 429) break;
    }

    expect(results).toContain(429);
  }, 30_000);
});

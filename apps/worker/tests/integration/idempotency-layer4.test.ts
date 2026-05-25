/**
 * Integration: Layer 4 action_id idempotency on POST /api/cases/:id/action.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, inject, it } from "vitest";

describe("Layer 4 action idempotency", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it.todo("replays the same action_id with identical JSON body and no second resume");
  it.todo("writes distinct rows for two different action_id values with the same payload");
});

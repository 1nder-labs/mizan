/**
 * Integration: full HITL cycle — suspend → action → terminal.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, inject, it } from "vitest";

describe("HITL workflow cycle", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it.todo("starts workflow and reaches SUSPENDED_HITL at awaitReviewerAction");
  it.todo("POST approve resumes, writes reviewer_actions + eval_promotions, finishes terminal");
  it.todo("POST override without rationale returns 400 with path rationale");
  it.todo("POST on non-suspended case returns 409");
});

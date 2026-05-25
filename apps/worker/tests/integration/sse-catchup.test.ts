/**
 * Integration: GET /api/cases/:id/stream — Last-Event-ID catch-up + live tail.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, inject, it } from "vitest";

describe("case SSE stream", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it.todo("replays seqs after Last-Event-ID for a seeded workflow_events tape");
  it.todo("closes after workflow.finish without live tail");
  it.todo("exits polling loop when AbortSignal aborts mid-tail");
});

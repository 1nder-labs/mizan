/**
 * Gate for integration tests that drive the full brief workflow, whose
 * `matchPolicy` step calls `env.VECTORIZE.query`.
 *
 * The integration pool defaults to `remoteBindings: false` (see
 * `apps/worker/vitest.config.ts`) because the remote-proxy subprocess
 * the `"remote": true` Vectorize binding needs OOMs the host Node heap
 * before any test code runs. Under that default `env.VECTORIZE` is a
 * local Miniflare stub that throws `Binding VECTORIZE needs to be run
 * remotely` on `.query`, so every full-workflow test would fail.
 *
 * `RUN_REMOTE_INTEGRATION=1` is the single opt-in: the config couples it
 * to BOTH `remoteBindings: true` AND this `RUN_REMOTE_VECTORIZE` binding,
 * so the skip gate can never drift from the binding mode. Default local
 * runs leave it unset — the workflow tests skip and the suite stays
 * legitimately green without faking the binding. To exercise them on a
 * host with enough heap (plus a live `OPENAI_API_KEY` in `.dev.vars`):
 *   `RUN_REMOTE_INTEGRATION=1 bun --filter @mizan/worker test:integration`
 *
 * The flag is read off `env` via zod rather than a production-type field:
 * it is a test-orchestration binding, not part of `CloudflareBindings`.
 */
import { env } from "cloudflare:workers";
import { z } from "zod";

const RemoteFlagSchema = z.object({
  RUN_REMOTE_VECTORIZE: z.string().optional(),
  RUN_LANGFUSE_E2E: z.string().optional(),
  RUN_EVAL: z.string().optional(),
});

const parsed = RemoteFlagSchema.safeParse(env);

export const RUN_REMOTE_VECTORIZE = parsed.success && parsed.data.RUN_REMOTE_VECTORIZE === "1";

/**
 * Gate for Langfuse E2E tests — requires a managed Langfuse Cloud project
 * (LANGFUSE_HOST + public/secret keys in the environment). Not run in CI;
 * local-only per PRD §7.11.
 *
 * Usage: `RUN_LANGFUSE_E2E=1 LANGFUSE_HOST=… LANGFUSE_PUBLIC_KEY=… \
 *   LANGFUSE_SECRET_KEY=… bun --filter @mizan/worker test:integration`
 */
export const RUN_LANGFUSE_E2E = parsed.success && parsed.data.RUN_LANGFUSE_E2E === "1";

/**
 * Gate for eval tests — requires `RUN_REMOTE_INTEGRATION=1` (remote
 * Vectorize binding) AND a live provider key (`OPENAI_API_KEY`).
 * Local-only, manual; never in CI.
 *
 * Usage: `RUN_REMOTE_INTEGRATION=1 RUN_EVAL=1 OPENAI_API_KEY=<key> \
 *   bun --filter @mizan/worker test:integration`
 */
export const RUN_EVAL = parsed.success && parsed.data.RUN_EVAL === "1";

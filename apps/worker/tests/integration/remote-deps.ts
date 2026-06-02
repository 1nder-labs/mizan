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

const RemoteFlagSchema = z.object({ RUN_REMOTE_VECTORIZE: z.string().optional() });

const parsed = RemoteFlagSchema.safeParse(env);

export const RUN_REMOTE_VECTORIZE = parsed.success && parsed.data.RUN_REMOTE_VECTORIZE === "1";

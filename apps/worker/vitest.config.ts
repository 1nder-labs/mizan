import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Integration project only — unit tests run on bun test (see apps/worker/package.json).
 *
 * `remoteBindings` defaults to `false` — the pool stays fully local with no
 * proxy-worker subprocess for bindings flagged `"remote": true` in wrangler.jsonc.
 * The remote-proxy subprocess (full wrangler `startWorker({ dev: { remote:
 * "minimal" } })` + websocket handshake) exhausts the host Node heap before any
 * test code runs. Only `VECTORIZE` has `"remote": true`; under `false` it becomes
 * a local Miniflare stub that throws on `.query`.
 *
 * `RUN_REMOTE_INTEGRATION=1` is the single opt-in for the full-workflow tests
 * (those whose `matchPolicy` step queries Vectorize). It couples `remoteBindings`
 * to `true` AND mirrors itself into the `RUN_REMOTE_VECTORIZE` binding the
 * `remote-deps.ts` gate reads — so the per-test skip can never drift from the
 * binding mode. Unset (the default), those tests skip and the suite is green
 * locally without faking; set (on a host with enough heap), they run for real.
 *
 * The miniflare `assets` block is intentionally omitted — wrangler.jsonc already
 * declares `assets.directory: "../web/dist"`. The previous override pointed the
 * asset manifest walker at `apps/worker/.` (including `node_modules/`), an
 * independent OOM vector during pool bootstrap.
 *
 * `MOCK_PROVIDERS_ALLOWED=1` is the production fail-closed guard for the mock
 * LLM / embedding providers — tests set it so `resolveLanguageModel` enters the
 * mock branch; production `wrangler deploy` never sets it, so a stray
 * `MOCK_LLM_RESPONSES` cannot accidentally activate mock replay in prod.
 *
 * WASM resolution (xxhash-wasm via @mastra/core) requires the flat hoisted
 * `node_modules/` layout — Bun's default `isolated` linker puts deps under
 * `.bun/<pkg>@<ver>/...` and the pool's module-fallback service generates a
 * malformed `@fs/...` URL it cannot resolve. The repo's `bunfig.toml` declares
 * `linker = "hoisted"` for this reason.
 */
const RUN_REMOTE = process.env.RUN_REMOTE_INTEGRATION === "1";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            remoteBindings: RUN_REMOTE,
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                MOCK_PROVIDERS_ALLOWED: "1",
                RUN_REMOTE_VECTORIZE: RUN_REMOTE ? "1" : "0",
                RUN_LANGFUSE_E2E: process.env.RUN_LANGFUSE_E2E === "1" ? "1" : "0",
                RUN_EVAL: RUN_REMOTE && process.env.RUN_EVAL === "1" ? "1" : "0",
              },
            },
          }),
        ],
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts", "tests/eval/**/*.test.ts"],
          globalSetup: ["./tests/setup/migrations.ts"],
          maxWorkers: 1,
          minWorkers: 1,
        },
      },
    ],
  },
});

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Integration project only — unit tests run on bun test (see apps/worker/package.json).
 *
 * `remoteBindings: false` keeps the pool fully local — no proxy-worker subprocess
 * spawns for bindings flagged `"remote": true` in wrangler.jsonc. The remote-proxy
 * subprocess (full wrangler `startWorker({ dev: { remote: "minimal" } })` +
 * websocket handshake) exhausts the host Node heap before any test code runs.
 * Only `VECTORIZE` has `"remote": true`; under `false` the binding becomes a
 * local Miniflare stub. Tests requiring real Vectorize must mock at the call
 * boundary.
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
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            remoteBindings: false,
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                MOCK_PROVIDERS_ALLOWED: "1",
              },
            },
          }),
        ],
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["./tests/setup/migrations.ts"],
          maxWorkers: 1,
          minWorkers: 1,
        },
      },
    ],
  },
});

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Two-project vitest config:
 *
 * - `unit` runs pure-logic tests (mocks + type guards) under the default
 *   vitest pool. No `cloudflareTest()` plugin → no workerd boot → no
 *   wrangler bundle traversal across the full Mastra + AI SDK dep graph.
 * - `integration` runs HTTP-level tests that need real D1 / KV / R2 bindings
 *   through `@cloudflare/vitest-pool-workers`. Sequential (`maxWorkers: 1`)
 *   because the Phase 2 Mastra stack doubles per-isolate memory footprint
 *   vs Phase 1 and parallel workerd processes OOM Node's main heap.
 *
 * Splitting projects avoids the Phase-2 OOM where every unit test file
 * triggered the heavy cloudflare pool bundle even though it never needed
 * workerd at all.
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
              assets: { binding: "ASSETS", directory: "." },
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
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});

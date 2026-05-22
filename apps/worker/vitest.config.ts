import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/** Integration project only — unit tests run on bun test (see apps/worker/package.json). */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            remoteBindings: true,
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
    ],
  },
});

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
              /**
               * Production fail-closed guard for the mock LLM /
               * embedding providers. Tests run with the flag set so
               * `resolveLanguageModel` enters the mock branch;
               * production `wrangler deploy` never sets it, so a
               * stray `MOCK_LLM_RESPONSES` cannot accidentally
               * activate mock replay in prod.
               */
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

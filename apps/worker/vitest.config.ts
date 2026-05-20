import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject } from "vitest/config";

/**
 * Phase 0 vitest config for `@mizan/worker`.
 *
 * `@cloudflare/vitest-pool-workers@0.16` removed the pre-0.13 API
 * (`defineWorkersConfig`, `poolOptions.workers.*`, `SELF`, and
 * `import { env } from "cloudflare:test"`). The replacement is the
 * `cloudflareTest()` Vite plugin plus `import { env, exports } from
 * "cloudflare:workers"`. See:
 * https://developers.cloudflare.com/workers/testing/vitest-integration/
 *
 * The `miniflare.assets` override drops `directory` from the merged worker
 * options so the pool does not validate `apps/web/dist` at bootstrap — the
 * Vite build for the web workspace runs lazily and Phase 0 tests only need
 * the binding stub to exist.
 *
 * `remoteBindings: false` keeps the pool fully local; no Cloudflare account
 * proxy is contacted during test runs.
 */
export default defineProject({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        assets: { binding: "ASSETS" },
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});

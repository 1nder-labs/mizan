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
      /**
       * `@cloudflare/vitest-pool-workers@0.16.0`'s zod schema requires
       * `miniflare.assets.directory` to be defined when an ASSETS binding is
       * present; an absent `directory` fails schema validation even though
       * Phase 0 tests only assert the binding's existence and never exercise
       * static-asset routing. The `directory: "."` placeholder satisfies the
       * schema without triggering a real asset crawl.
       *
       * When pool-workers ships a version that accepts an absent `directory`
       * (matching the `workers-assets-no-dir` fixture upstream), this entire
       * `miniflare` override block can be deleted. Track removal via the
       * pool-workers changelog:
       * https://github.com/cloudflare/workers-sdk/blob/main/packages/vitest-pool-workers/CHANGELOG.md
       */
      miniflare: {
        assets: { binding: "ASSETS", directory: "." },
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/setup/migrations.ts"],
    /**
     * Limit concurrent workerd processes to 2. Cloudflare's vitest pool
     * spawns one workerd per test file by default; running all 9 files
     * simultaneously exhausts local resources and triggers "Timeout starting
     * cloudflare-pool runner" errors.
     */
    maxWorkers: 2,
    /**
     * Enable vitest typecheck so `expectTypeOf` assertions in schema-shape
     * tests are enforced at compile time, not silently passed at runtime.
     * Without this, a wrong `toEqualTypeOf<string>()` on a `Date` field would
     * pass the test suite despite being incorrect.
     */
    typecheck: {
      enabled: true,
      tsconfig: "./tests/tsconfig.json",
    },
  },
});

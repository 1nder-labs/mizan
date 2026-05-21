/**
 * Augments vitest's `ProvidedContext` so that `inject("migrations")` is
 * typed as `D1Migration[]` throughout integration test files.
 *
 * The `D1Migration` type is declared in
 * `@cloudflare/vitest-pool-workers/types/cloudflare-test.d.ts` and exposed
 * through the `@cloudflare/vitest-pool-workers` ambient types pulled in by
 * `apps/worker/tests/tsconfig.json`.
 */
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare module "vitest" {
  export interface ProvidedContext {
    migrations: D1Migration[];
  }
}

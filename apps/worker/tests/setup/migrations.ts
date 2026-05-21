/**
 * Vitest globalSetup: loads D1 migrations from disk once per test process.
 *
 * `readD1Migrations` runs in the Node.js host process (not inside workerd) so
 * it can access the filesystem. The loaded array is serialised via `provide()`
 * and consumed by each integration test file via `inject("migrations")` +
 * `applyD1Migrations(env.DB, inject("migrations"))` in `beforeAll`.
 *
 * `import.meta.dirname` is available in Node 20+ and Bun — both of which
 * power vitest's globalSetup execution environment.
 */

import path from "node:path";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers";
import type { ProvidedContext } from "vitest";

/**
 * Vitest 4 does not export a `GlobalSetupContext` type. The runtime shape of
 * the first argument is `{ provide, name, config }` — only `provide` is used
 * here. `provide` is typed against the project-wide `ProvidedContext`
 * interface declared in `tests/setup/d1-types.d.ts`.
 */
interface SetupContext {
  readonly provide: <K extends keyof ProvidedContext>(
    key: K,
    value: ProvidedContext[K],
  ) => void;
}

export default async function setup({ provide }: SetupContext): Promise<void> {
  const migrationsPath = path.resolve(import.meta.dirname, "../../../../packages/db/migrations");
  const migrations = await readD1Migrations(migrationsPath);
  provide("migrations", migrations);
}

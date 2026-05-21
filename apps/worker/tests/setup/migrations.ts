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
import type { GlobalSetupContext } from "vitest/node";

export default async function setup({ provide }: GlobalSetupContext): Promise<void> {
  const migrationsPath = path.resolve(import.meta.dirname, "../../../../packages/db/migrations");
  const migrations = await readD1Migrations(migrationsPath);
  provide("migrations", migrations);
}

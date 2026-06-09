/**
 * drizzle-kit config for `@mizan/db`.
 *
 * Generates SQL migrations from `src/schema.ts` + `src/documents.schema.ts`
 * (domain tables) + `src/auth.schema.ts` (better-auth-generated tables). `dialect: "sqlite"`
 * is the local-generate driver; the produced SQL is applied to Cloudflare
 * D1 via `bunx wrangler d1 migrations apply DB --local`, not by drizzle-kit
 * directly. Wrangler tracks applied migrations in its own `d1_migrations`
 * table, so re-running this generator + re-applying is idempotent.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/schema.ts", "./src/documents.schema.ts", "./src/auth.schema.ts"],
  out: "./migrations",
  dialect: "sqlite",
  verbose: true,
  strict: true,
});

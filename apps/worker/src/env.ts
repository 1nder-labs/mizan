/**
 * Cloudflare Worker runtime bindings — re-exported from `@mizan/shared`.
 *
 * The canonical `CloudflareBindings` interface lives in
 * `packages/shared/src/cloudflare-bindings.ts` so library packages
 * (`@mizan/mastra`) can type their `env` parameters without an inverted
 * dependency on the app layer. This file remains the conventional
 * import surface for code inside `apps/worker` (route handlers,
 * middleware, fetch entrypoint).
 *
 * `wrangler.jsonc` is still the runtime source of truth — rerun
 * `bunx wrangler types` from this directory after binding changes to
 * refresh `worker-configuration.d.ts`, and update the shared interface
 * to match.
 */
export type { CloudflareBindings } from "@mizan/shared";

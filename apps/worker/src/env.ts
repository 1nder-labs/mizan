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
 * `BRIEF_STREAM` stays a plain `DurableObjectNamespace` here — the DO is
 * addressed over its `fetch()` interface (not typed RPC), which keeps the
 * binding free of the deep, recursively-instantiated RPC stub type.
 *
 * `wrangler.jsonc` is the runtime source of truth — rerun `bunx wrangler types`
 * after binding changes and keep the shared interface in sync.
 */
export type { CloudflareBindings } from "@mizan/shared";

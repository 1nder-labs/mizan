/**
 * Cloudflare Worker runtime bindings.
 *
 * Bindings are declared in `apps/worker/wrangler.jsonc` (source of truth).
 * The shape below mirrors that file. We import the binding types from
 * `@cloudflare/workers-types` directly rather than from the workerd-generated
 * `Cloudflare.Env` namespace so that third-party deps that bundle
 * `@cloudflare/workers-types` (e.g. `better-auth-cloudflare`) align on the
 * same nominal types — workerd-generated globals are a different type
 * source even when structurally identical.
 *
 * Re-run `bunx wrangler types` after binding changes to refresh
 * `worker-configuration.d.ts`; this `CloudflareBindings` interface must
 * be hand-updated to match.
 */
import type {
  D1Database,
  Fetcher,
  KVNamespace,
  Queue,
  R2Bucket,
  VectorizeIndex,
} from "@cloudflare/workers-types";

export interface CloudflareBindings {
  DB: D1Database;
  KV: KVNamespace;
  R2_BUCKET: R2Bucket;
  VECTORIZE: VectorizeIndex;
  BRIEF_QUEUE: Queue;
  ASSETS: Fetcher;
  DEFAULT_LLM_PROVIDER: "anthropic";
  DEFAULT_LLM_MODEL: "claude-opus-4-7";
  LANGFUSE_HOST: "";
}

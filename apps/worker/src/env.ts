/**
 * Cloudflare Worker runtime bindings.
 *
 * Shape mirrors `apps/worker/wrangler.jsonc`. Every field is a live binding the
 * Worker receives at request time; never trust their presence at module scope.
 */
export interface CloudflareBindings {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  VECTORIZE: VectorizeIndex;
  KV: KVNamespace;
  BRIEF_QUEUE: Queue;
  ASSETS: Fetcher;
  DEFAULT_LLM_PROVIDER: string;
  DEFAULT_LLM_MODEL: string;
  LANGFUSE_HOST: string;
}

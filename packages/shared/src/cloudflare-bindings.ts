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
 * Re-run `bunx wrangler types` from `apps/worker` after binding changes
 * to refresh `worker-configuration.d.ts`; this `CloudflareBindings`
 * interface must be hand-updated to match.
 *
 * The interface lives in `@mizan/shared` (not in `apps/worker`) so library
 * packages like `@mizan/mastra` can type their `env` parameters without
 * an inverted dependency on the app layer.
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
  DEFAULT_LLM_PROVIDER: "anthropic" | "openai" | "openrouter";
  /**
   * Langfuse base URL — empty in dev disables the OTel exporter entirely.
   * Phase 8 boots the local Langfuse Docker stack and points this at
   * `http://localhost:3010`; production points it at managed Langfuse.
   */
  LANGFUSE_HOST: string;
  /** Langfuse project public key — required to activate the @mastra/langfuse exporter. */
  LANGFUSE_PUBLIC_KEY?: string;
  /** Langfuse project secret key — required to activate the @mastra/langfuse exporter. */
  LANGFUSE_SECRET_KEY?: string;
  /** Anthropic API key — consumed by `@mizan/mastra/models/factory.ts`. */
  ANTHROPIC_API_KEY?: string;
  /** OpenAI API key — consumed by `@mizan/mastra/models/factory.ts`. */
  OPENAI_API_KEY?: string;
  /** OpenRouter API key — consumed by `@mizan/mastra/models/factory.ts`. */
  OPENROUTER_API_KEY?: string;
  /**
   * Production fail-closed guard for the mock LLM / embedding
   * providers. The resolver only branches into a mock when this flag is
   * explicitly set to `"1"` — `MOCK_LLM_RESPONSES` and `MOCK_EMBEDDINGS`
   * alone are not enough. Tests set both; production deploys (and the
   * Phase 10 wrangler.jsonc) never set this guard, so a stray
   * `MOCK_LLM_RESPONSES` value smuggled into prod env vars cannot
   * activate mock replay.
   */
  MOCK_PROVIDERS_ALLOWED?: string;
  /** JSON-encoded mock LLM response map for integration tests. */
  MOCK_LLM_RESPONSES?: string;
  MOCK_EMBEDDINGS?: string;
}

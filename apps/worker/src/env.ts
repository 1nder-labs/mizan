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
  DEFAULT_LLM_PROVIDER: "anthropic" | "openai" | "openrouter";
  DEFAULT_LLM_MODEL: string;
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
  /** JSON-encoded mock LLM response map for integration tests. */
  MOCK_LLM_RESPONSES?: string;
  MOCK_EMBEDDINGS?: string;
}

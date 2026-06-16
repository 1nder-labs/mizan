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
  DurableObjectNamespace,
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
  /**
   * Durable Object namespace backing the resumable brief stream — one instance
   * per `runId`, a pure buffer/broadcast store (NOT a workflow executor; the
   * workflow runs in the Mode-B queue consumer). Typed loosely here (shared
   * cannot import the worker-only DO class); `apps/worker/src/env.ts` refines it
   * to `DurableObjectNamespace<BriefStreamDO>` so the RPC methods are visible.
   */
  BRIEF_STREAM: DurableObjectNamespace;
  ASSETS: Fetcher;
  /**
   * Organization id that client self-signups join as `client` members —
   * the single designated review org for this deployment. Read only via
   * `resolveReviewOrgId`, which throws when blank so a misconfigured worker
   * fails loud instead of dropping clients into the wrong org. Empty in
   * `wrangler.jsonc`; set per-environment (dev: `.dev.vars` after seeding).
   */
  REVIEW_ORG_ID: string;
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
  /** Cloudflare account ID hosting the R2 bucket — non-secret (already public in wrangler.jsonc). */
  R2_ACCOUNT_ID?: string;
  /** R2 bucket name; defaults to `mizan-uploads` when unset. */
  R2_BUCKET_NAME?: string;
  /** R2 API token access key id — Object Read Only scope on the upload bucket. SECRET. */
  R2_ACCESS_KEY_ID?: string;
  /** R2 API token secret access key — paired with R2_ACCESS_KEY_ID. SECRET. */
  R2_SECRET_ACCESS_KEY?: string;
  /**
   * Global per-UTC-day cap on brief-generation runs across the whole
   * deployment — an abuse guardrail for the shared demo URL. Parsed as an
   * integer; falls back to a built-in default when unset/invalid. Tune
   * down (no redeploy) via `wrangler secret put` to tighten the guardrail.
   */
  AI_DAILY_BRIEF_CAP?: string;
  /** Global per-UTC-day cap on copilot chat messages across the deployment. See AI_DAILY_BRIEF_CAP. */
  AI_DAILY_CHAT_CAP?: string;
  /**
   * Portal write-limiter fixed-window length in seconds (default 60). Overridden
   * to a long value in integration tests so the 30-write loop cannot straddle a
   * wall-clock window roll (which would reset the counter mid-test and flake the
   * "30 then 429" assertion under full-suite load). Not set in production.
   */
  PORTAL_RL_WINDOW_SECONDS?: string;
}

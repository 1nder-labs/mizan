/**
 * Augments the workerd-generated `Cloudflare.Env` namespace with bindings
 * declared in `src/env.ts` that `wrangler types` does not emit:
 *
 * - Optional API keys for runtime model selection
 * - Optional Langfuse credentials
 * - Test-only mock env vars (`MOCK_LLM_RESPONSES`, `MOCK_EMBEDDINGS`)
 *
 * Without this augmentation, the `env` imported from `cloudflare:workers` is
 * typed as the partial `Cloudflare.Env` from `worker-configuration.d.ts`,
 * which forces unsafe casts in integration tests when they need to set the
 * mock env variables.
 */

declare namespace Cloudflare {
  interface Env {
    ANTHROPIC_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    LANGFUSE_PUBLIC_KEY?: string;
    LANGFUSE_SECRET_KEY?: string;
    MOCK_LLM_RESPONSES?: string;
    MOCK_EMBEDDINGS?: string;
    MOCK_PROVIDERS_ALLOWED?: string;
  }
}

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { CloudflareBindings } from "@mizan/shared";

export type LlmProvider = "anthropic" | "openai" | "openrouter";

export interface ModelConfig {
  readonly provider: LlmProvider;
  readonly model: string;
}

export type ModelKind = "extract" | "compose" | "copilot";

interface ProviderModelMap {
  readonly extract: string;
  readonly compose: string;
  readonly copilot: string;
}

/**
 * `copilot` is a full (non-mini) reasoning model: the reviewer copilot answers
 * free-form questions over case/brief/signal data, where a smaller model
 * paraphrases loosely and hallucinates. Kept separate from `compose` so the
 * brief pipeline's cost/latency profile is unaffected.
 */
const PROVIDER_DEFAULTS: Record<LlmProvider, ProviderModelMap> = {
  anthropic: {
    extract: "claude-haiku-4-5",
    compose: "claude-opus-4-7",
    copilot: "claude-opus-4-7",
  },
  openai: {
    extract: "gpt-5.4-mini-2026-03-17",
    compose: "gpt-5.4-2026-03-05",
    copilot: "gpt-5.4-mini-2026-03-17",
  },
  openrouter: {
    extract: "anthropic/claude-3.5-haiku",
    compose: "anthropic/claude-3.5-sonnet",
    copilot: "anthropic/claude-3.5-sonnet",
  },
};

function isLlmProvider(value: string): value is LlmProvider {
  return value === "anthropic" || value === "openai" || value === "openrouter";
}

function hasProviderKey(env: CloudflareBindings, provider: LlmProvider): boolean {
  if (provider === "anthropic") return Boolean(env.ANTHROPIC_API_KEY);
  if (provider === "openai") return Boolean(env.OPENAI_API_KEY);
  return Boolean(env.OPENROUTER_API_KEY);
}

function resolveProvider(env: CloudflareBindings): LlmProvider {
  if (isLlmProvider(env.DEFAULT_LLM_PROVIDER) && hasProviderKey(env, env.DEFAULT_LLM_PROVIDER)) {
    return env.DEFAULT_LLM_PROVIDER;
  }
  const fallbackOrder: LlmProvider[] = ["openai", "anthropic", "openrouter"];
  for (const candidate of fallbackOrder) {
    if (hasProviderKey(env, candidate)) return candidate;
  }
  throw new Error(
    "no LLM provider API key available — set one of ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY in .dev.vars or via wrangler secret",
  );
}

export function getDefaultModel(env: CloudflareBindings, kind: ModelKind): ModelConfig {
  const provider = resolveProvider(env);
  return { provider, model: PROVIDER_DEFAULTS[provider][kind] };
}

export function getModel(config: ModelConfig, env: CloudflareBindings): LanguageModelV3 {
  switch (config.provider) {
    case "anthropic":
      return anthropic(config.model);
    case "openai":
      return openai(config.model);
    case "openrouter": {
      const apiKey = env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for openrouter provider");
      const openrouter = createOpenRouter({ apiKey });
      return openrouter(config.model);
    }
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unknown LLM provider: ${String(exhaustive)}`);
    }
  }
}

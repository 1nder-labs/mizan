import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { withMastra } from "@mastra/ai-sdk";
import type { CloudflareBindings } from "@mizan/worker/env";
import { mockProvider } from "../test/mock-provider.ts";

export type LlmProvider = "anthropic" | "openai" | "openrouter";

export interface ModelConfig {
  readonly provider: LlmProvider;
  readonly model: string;
}

export interface GetModelOptions {
  readonly withMastraOpts?: Parameters<typeof withMastra>[1];
}

/**
 * Single injection point for all LLM providers in Mizan.
 * Routes by `{ provider, model }`; short-circuits to mockProvider when
 * `env.MOCK_LLM_RESPONSES` is set (integration tests).
 */
export function getModel(
  config: ModelConfig,
  env: CloudflareBindings,
  opts: GetModelOptions = {},
): LanguageModelV3 {
  if (env.MOCK_LLM_RESPONSES) {
    return mockProvider(env.MOCK_LLM_RESPONSES);
  }

  const raw = routeProvider(config, env);
  return withMastra(raw, opts.withMastraOpts ?? {});
}

function routeProvider(config: ModelConfig, env: CloudflareBindings): LanguageModelV3 {
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

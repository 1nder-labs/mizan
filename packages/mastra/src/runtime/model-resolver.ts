import type { LanguageModelV3 } from "@ai-sdk/provider";
import { withMastra } from "@mastra/ai-sdk";
import type { CloudflareBindings } from "@mizan/worker/env";
import {
  embedPolicyText,
  embedPolicyTexts,
  type EmbeddingEnv,
} from "../models/embedding-factory.ts";
import { getDefaultModel, getModel, type ModelConfig, type ModelKind } from "../models/factory.ts";
import { mockProvider } from "../test/mock-provider.ts";

type WithMastraOpts = Parameters<typeof withMastra>[1];

const MOCK_EMBEDDING_DIMENSION = 1536;

export interface ResolveLanguageModelArgs {
  readonly env: CloudflareBindings;
  readonly kind: ModelKind;
  readonly override?: ModelConfig;
  readonly withMastraOpts?: WithMastraOpts;
}

export interface ResolvedLanguageModel {
  readonly model: LanguageModelV3;
  readonly config: ModelConfig;
}

export function resolveLanguageModel(args: ResolveLanguageModelArgs): ResolvedLanguageModel {
  if (args.env.MOCK_LLM_RESPONSES) {
    return {
      model: mockProvider(args.env.MOCK_LLM_RESPONSES),
      config: args.override ?? { provider: "anthropic", model: "mock-llm" },
    };
  }
  const config = args.override ?? getDefaultModel(args.env, args.kind);
  const raw = getModel(config, args.env);
  return { model: withMastra(raw, args.withMastraOpts ?? {}), config };
}

export async function resolveQueryEmbedding(
  env: EmbeddingEnv,
  value: string,
  opts?: { readonly abortSignal?: AbortSignal },
): Promise<number[]> {
  if (shouldMockEmbeddings(env)) return deterministicEmbedding(value);
  return embedPolicyText({
    env,
    value,
    ...(opts?.abortSignal ? { abortSignal: opts.abortSignal } : {}),
  });
}

export async function resolveBatchEmbeddings(
  env: EmbeddingEnv,
  values: readonly string[],
): Promise<number[][]> {
  if (values.length === 0) return [];
  if (shouldMockEmbeddings(env)) return values.map((value) => deterministicEmbedding(value));
  return embedPolicyTexts({ env, values });
}

function shouldMockEmbeddings(env: EmbeddingEnv): boolean {
  return Boolean(env.MOCK_EMBEDDINGS) || Boolean(env.MOCK_LLM_RESPONSES && !env.OPENAI_API_KEY);
}

function deterministicEmbedding(text: string): number[] {
  const vector = Array.from<number>({ length: MOCK_EMBEDDING_DIMENSION }).fill(0);
  let seed = 0;
  for (let i = 0; i < text.length; i += 1) {
    seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < MOCK_EMBEDDING_DIMENSION; i += 1) {
    seed = (seed * 1664525 + 1013904223 + i) >>> 0;
    vector[i] = (seed % 1000) / 1000 - 0.5;
  }
  return vector;
}

export type { EmbeddingEnv };

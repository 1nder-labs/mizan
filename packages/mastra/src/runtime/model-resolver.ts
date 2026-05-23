import type { LanguageModelV3 } from "@ai-sdk/provider";
import { withMastra } from "@mastra/ai-sdk";
import type { CloudflareBindings } from "@mizan/shared";
import {
  embedPolicyText,
  embedPolicyTexts,
  type EmbeddingEnv,
} from "../models/embedding-factory.ts";
import { getDefaultModel, getModel, type ModelConfig, type ModelKind } from "../models/factory.ts";

type WithMastraOpts = Parameters<typeof withMastra>[1];

/** Factory for a mock LanguageModel — registered by `@mizan/mastra/testing`. */
type MockLanguageModelFactory = (serializedMap: string) => LanguageModelV3;

/** Factory for a deterministic embedding — registered by `@mizan/mastra/testing`. */
type MockEmbeddingFactory = (text: string) => number[];

let registeredMockLanguageModel: MockLanguageModelFactory | null = null;
let registeredMockEmbedding: MockEmbeddingFactory | null = null;

/**
 * Registers test-only mock providers. Production never calls this — only
 * `@mizan/mastra/testing` does. Production builds therefore never import
 * the test scaffolding and never trigger the mock branches below.
 */
export function registerTestProviders(opts: {
  readonly mockLanguageModel?: MockLanguageModelFactory;
  readonly mockEmbedding?: MockEmbeddingFactory;
}): void {
  if (opts.mockLanguageModel) registeredMockLanguageModel = opts.mockLanguageModel;
  if (opts.mockEmbedding) registeredMockEmbedding = opts.mockEmbedding;
}

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
  if (args.env.MOCK_LLM_RESPONSES && registeredMockLanguageModel) {
    return {
      model: registeredMockLanguageModel(args.env.MOCK_LLM_RESPONSES),
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
  if (shouldMockEmbeddings(env) && registeredMockEmbedding) {
    return registeredMockEmbedding(value);
  }
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
  if (shouldMockEmbeddings(env) && registeredMockEmbedding) {
    const fn = registeredMockEmbedding;
    return values.map((value) => fn(value));
  }
  return embedPolicyTexts({ env, values });
}

function shouldMockEmbeddings(env: EmbeddingEnv): boolean {
  return Boolean(env.MOCK_EMBEDDINGS) || Boolean(env.MOCK_LLM_RESPONSES && !env.OPENAI_API_KEY);
}

export type { EmbeddingEnv };

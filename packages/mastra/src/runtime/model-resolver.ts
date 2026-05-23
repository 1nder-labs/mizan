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

interface MockProviderRegistry {
  readonly mockLanguageModel: MockLanguageModelFactory | null;
  readonly mockEmbedding: MockEmbeddingFactory | null;
}

/**
 * Module-private registry; written ONCE by `registerTestProviders` and
 * read by `resolveLanguageModel` / `resolve*Embedding` below. Freezing
 * after the first set call enforces the "test-only, configured at
 * import time" contract: the resolver branches on env-gated mock
 * variables, so the registry never needs to change at runtime, and a
 * second call from a test file that forgot it would otherwise mask the
 * symptom of a duplicate test bootstrap.
 */
let registry: MockProviderRegistry = { mockLanguageModel: null, mockEmbedding: null };
let registryFrozen = false;

/**
 * Registers test-only mock providers. Production never calls this — only
 * `@mizan/mastra/testing` does, exactly once as a side-effect of being
 * imported. Throws on a second call so divergent registrations cannot
 * silently overwrite each other.
 */
export function registerTestProviders(opts: {
  readonly mockLanguageModel?: MockLanguageModelFactory;
  readonly mockEmbedding?: MockEmbeddingFactory;
}): void {
  if (registryFrozen) {
    throw new Error(
      "registerTestProviders: test providers already registered for this isolate — import @mizan/mastra/testing exactly once per process",
    );
  }
  registry = {
    mockLanguageModel: opts.mockLanguageModel ?? null,
    mockEmbedding: opts.mockEmbedding ?? null,
  };
  registryFrozen = true;
}

/** Test-only escape hatch. Used by the registry-isolation unit test to reset between cases. */
export function __resetTestProvidersForTesting(): void {
  registry = { mockLanguageModel: null, mockEmbedding: null };
  registryFrozen = false;
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
  if (args.env.MOCK_LLM_RESPONSES && registry.mockLanguageModel) {
    return {
      model: registry.mockLanguageModel(args.env.MOCK_LLM_RESPONSES),
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
  if (shouldMockEmbeddings(env) && registry.mockEmbedding) {
    return registry.mockEmbedding(value);
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
  if (shouldMockEmbeddings(env) && registry.mockEmbedding) {
    const fn = registry.mockEmbedding;
    return values.map((value) => fn(value));
  }
  return embedPolicyTexts({ env, values });
}

function shouldMockEmbeddings(env: EmbeddingEnv): boolean {
  return Boolean(env.MOCK_EMBEDDINGS) || Boolean(env.MOCK_LLM_RESPONSES && !env.OPENAI_API_KEY);
}

export type { EmbeddingEnv };

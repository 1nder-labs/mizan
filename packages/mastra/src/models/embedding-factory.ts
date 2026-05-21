import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany, type EmbeddingModel } from "ai";
import type { CloudflareBindings } from "@mizan/worker/env";

const EMBEDDING_MODEL_ID = "text-embedding-3-small";
const MOCK_EMBEDDING_DIMENSION = 1536;

export type EmbeddingEnv = Pick<
  CloudflareBindings,
  "OPENAI_API_KEY" | "MOCK_EMBEDDINGS" | "MOCK_LLM_RESPONSES"
>;

/**
 * Returns true when callers want deterministic pseudo-vectors instead of OpenAI.
 * `MOCK_EMBEDDINGS` is the explicit switch; `MOCK_LLM_RESPONSES` is honoured for
 * backwards compatibility with non-RAG integration tests that pre-date the split.
 */
function shouldMockEmbeddings(env: EmbeddingEnv): boolean {
  return Boolean(env.MOCK_EMBEDDINGS) || Boolean(env.MOCK_LLM_RESPONSES && !env.OPENAI_API_KEY);
}

/**
 * Returns the canonical embedding model for Mizan policy RAG.
 * 1536-dim output matches the `mizan-policy-corpus` Vectorize index dim.
 */
export function getEmbeddingModel(env: EmbeddingEnv): EmbeddingModel {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for embedding operations");
  }
  const openai = createOpenAI({ apiKey });
  return openai.embedding(EMBEDDING_MODEL_ID);
}

/**
 * Embeds a single query string. Uses deterministic vectors when
 * `shouldMockEmbeddings(env)` is true (MOCK_EMBEDDINGS set, or MOCK_LLM_RESPONSES
 * set with no OPENAI_API_KEY); calls OpenAI otherwise.
 */
export async function embedPolicyText(env: EmbeddingEnv, value: string): Promise<number[]> {
  if (shouldMockEmbeddings(env)) {
    return deterministicEmbedding(value);
  }
  const { embedding } = await embed({ model: getEmbeddingModel(env), value });
  return embedding;
}

/**
 * Embeds many chunk texts via AI SDK `embedMany` (auto-batches + ordered response).
 * Uses deterministic vectors when `shouldMockEmbeddings(env)` is true.
 */
export async function embedPolicyTexts(
  env: EmbeddingEnv,
  values: readonly string[],
): Promise<number[][]> {
  if (values.length === 0) return [];
  if (shouldMockEmbeddings(env)) {
    return values.map((value) => deterministicEmbedding(value));
  }
  const { embeddings } = await embedMany({
    model: getEmbeddingModel(env),
    values: [...values],
  });
  return embeddings;
}

function deterministicEmbedding(text: string): number[] {
  const vector = Array.from({ length: MOCK_EMBEDDING_DIMENSION }, () => 0);
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

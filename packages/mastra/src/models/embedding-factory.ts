import { createOpenAI } from "@ai-sdk/openai";
import { embed, type EmbeddingModel } from "ai";
import type { CloudflareBindings } from "@mizan/worker/env";

const EMBEDDING_MODEL_ID = "text-embedding-3-small";
const MOCK_EMBEDDING_DIMENSION = 1536;

export type EmbeddingEnv = Pick<CloudflareBindings, "OPENAI_API_KEY" | "MOCK_LLM_RESPONSES">;

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

/** Embeds a single query string, using deterministic vectors under MOCK_LLM_RESPONSES. */
export async function embedPolicyText(env: EmbeddingEnv, value: string): Promise<number[]> {
  if (env.MOCK_LLM_RESPONSES) {
    return deterministicEmbedding(value);
  }
  const { embedding } = await embed({ model: getEmbeddingModel(env), value });
  return embedding;
}

/** Embeds many chunk texts, using deterministic vectors under MOCK_LLM_RESPONSES. */
export async function embedPolicyTexts(
  env: EmbeddingEnv,
  values: readonly string[],
): Promise<number[][]> {
  if (values.length === 0) return [];
  if (env.MOCK_LLM_RESPONSES) {
    return values.map((value) => deterministicEmbedding(value));
  }
  const model = getEmbeddingModel(env);
  const embeddings: number[][] = [];
  for (const value of values) {
    const { embedding } = await embed({ model, value });
    embeddings.push(embedding);
  }
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

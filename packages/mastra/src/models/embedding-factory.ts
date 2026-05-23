import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany, type EmbeddingModel } from "ai";
import type { CloudflareBindings } from "@mizan/shared";

const EMBEDDING_MODEL_ID = "text-embedding-3-small";

export type EmbeddingEnv = Pick<
  CloudflareBindings,
  "OPENAI_API_KEY" | "MOCK_EMBEDDINGS" | "MOCK_LLM_RESPONSES"
>;

export function getEmbeddingModel(env: { readonly OPENAI_API_KEY?: string }): EmbeddingModel {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for embedding operations");
  }
  const openai = createOpenAI({ apiKey });
  return openai.embedding(EMBEDDING_MODEL_ID);
}

export interface EmbedSingleArgs {
  readonly env: { readonly OPENAI_API_KEY?: string };
  readonly value: string;
  readonly abortSignal?: AbortSignal;
}

export async function embedPolicyText(args: EmbedSingleArgs): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel(args.env),
    value: args.value,
    ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
  });
  return embedding;
}

export interface EmbedManyArgs {
  readonly env: { readonly OPENAI_API_KEY?: string };
  readonly values: readonly string[];
}

export async function embedPolicyTexts(args: EmbedManyArgs): Promise<number[][]> {
  if (args.values.length === 0) return [];
  const { embeddings } = await embedMany({
    model: getEmbeddingModel(args.env),
    values: [...args.values],
  });
  return embeddings;
}

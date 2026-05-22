import { corporaForSource } from "../../packages/mastra/src/corpus/load.ts";
import { chunkCorpusRecords, type ChunkRecord } from "../../packages/mastra/src/corpus/chunk.ts";
import { resolveBatchEmbeddings } from "../../packages/mastra/src/runtime/model-resolver.ts";
import type { EmbeddingEnv } from "../../packages/mastra/src/runtime/model-resolver.ts";
import type { Corpus as CorpusType } from "../../packages/mastra/src/schemas/corpus.ts";

const UPSERT_BATCH_SIZE = 100;

export interface VectorizeVector {
  readonly id: string;
  readonly values: number[];
  readonly metadata?: Record<string, string | number | boolean>;
}

export type { ChunkRecord };

export interface EmbedCorpusOptions {
  readonly source?: "zakat" | "safety";
  readonly dryRun?: boolean;
  readonly corpus?: {
    readonly zakat?: CorpusType;
    readonly safety?: CorpusType;
  };
}

export interface EmbedCorpusResult {
  readonly upsertedCount: number;
  readonly chunksBySource: Record<string, number>;
}

export async function embedChunkRecords(
  records: readonly ChunkRecord[],
  env: EmbeddingEnv,
): Promise<VectorizeVector[]> {
  if (records.length === 0) return [];
  const embeddings = await resolveBatchEmbeddings(
    env,
    records.map((record) => record.text),
  );
  return records.map((record, index) => {
    const values = embeddings[index];
    if (!values) throw new Error(`missing embedding for vector ${record.id}`);
    return { id: record.id, values, metadata: record.metadata };
  });
}

/** Computes Vectorize vectors for the committed corpora without upserting. */
export async function computeCorpusVectors(
  options: EmbedCorpusOptions,
  env: EmbeddingEnv,
): Promise<VectorizeVector[]> {
  const corpora = resolveCorpora(options);
  const records = await chunkCorpusRecords(corpora);
  return embedChunkRecords(records, env);
}

function resolveCorpora(options: EmbedCorpusOptions): CorpusType[] {
  if (options.corpus) {
    const selected: CorpusType[] = [];
    if (options.corpus.zakat) selected.push(options.corpus.zakat);
    if (options.corpus.safety) selected.push(options.corpus.safety);
    if (selected.length > 0) return selected;
  }
  return corporaForSource(options.source);
}

function countBySource(records: readonly ChunkRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    counts[record.metadata.source] = (counts[record.metadata.source] ?? 0) + 1;
  }
  return counts;
}

/** Upserts corpus vectors into a Vectorize binding — used by integration tests. */
export async function embedCorpusInto(
  vectorize: VectorizeIndexLike,
  options: EmbedCorpusOptions,
  env: EmbeddingEnv,
): Promise<EmbedCorpusResult> {
  const corpora = resolveCorpora(options);
  const records = await chunkCorpusRecords(corpora);
  const vectors = await embedChunkRecords(records, env);
  if (options.dryRun) {
    return { upsertedCount: vectors.length, chunksBySource: countBySource(records) };
  }
  for (let offset = 0; offset < vectors.length; offset += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(offset, offset + UPSERT_BATCH_SIZE);
    await vectorize.upsert(batch);
  }
  return { upsertedCount: vectors.length, chunksBySource: countBySource(records) };
}

export interface VectorizeIndexLike {
  upsert(vectors: VectorizeVector[]): Promise<unknown>;
}

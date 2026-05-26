import { MDocument } from "@mastra/rag";
import type { Corpus } from "../schemas/corpus.ts";

const CHUNK_MAX_SIZE = 512;
const CHUNK_OVERLAP = 64;

export interface ChunkRecord {
  readonly id: string;
  readonly text: string;
  readonly metadata: {
    readonly source: "zakat" | "safety";
    readonly clauseId: string;
    readonly chunkIndex: number;
    readonly corpusVersion: string;
    readonly title: string;
  };
}

/** Chunks all clauses in the supplied corpora into Vectorize-ready records. */
export async function chunkCorpusRecords(corpora: readonly Corpus[]): Promise<ChunkRecord[]> {
  const records: ChunkRecord[] = [];
  for (const corpus of corpora) {
    for (const clause of corpus.clauses) {
      const doc = MDocument.fromText(clause.body, {
        clauseId: clause.clauseId,
        source: corpus.source,
        corpusVersion: corpus.corpusVersion,
        title: clause.title,
      });
      const chunks = await doc.chunk({
        strategy: "recursive",
        maxSize: CHUNK_MAX_SIZE,
        overlap: CHUNK_OVERLAP,
        separators: ["\n\n", "\n", " "],
      });
      chunks.forEach((chunk, chunkIndex) => {
        records.push({
          id: `${corpus.source}:${clause.clauseId}:${chunkIndex}`,
          text: chunk.text,
          metadata: {
            source: corpus.source,
            clauseId: clause.clauseId,
            chunkIndex,
            corpusVersion: corpus.corpusVersion,
            title: clause.title,
          },
        });
      });
    }
  }
  return records;
}

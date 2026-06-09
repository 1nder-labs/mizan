/**
 * `getClauseById(source, clauseId)` — synchronous lookup over the
 * bundled corpus JSON. Builds a `Map<string, ClauseWithMeta>` once at
 * module-import time keyed by `${source}:${clauseId}`. Used by
 * `apps/worker/src/routes/policy-clauses.ts` to serve full clause
 * bodies to the citation drawer without a Vectorize round-trip
 * (Vectorize stores chunks, not whole clauses — see `chunk.ts:38`).
 *
 * The corpus is ~50 KB total in memory and tree-shakes out of bundles
 * that don't import `@mizan/mastra` (the web bundle does not).
 */
import { loadPolicyCorpora } from "./load.ts";
import type { Clause } from "../schemas/corpus.ts";

export type CorpusSource = "zakat" | "safety";

export interface ClauseWithMeta extends Clause {
  readonly source: CorpusSource;
  readonly corpusVersion: string;
}

function buildClauseMap(): ReadonlyMap<string, ClauseWithMeta> {
  const map = new Map<string, ClauseWithMeta>();
  for (const corpus of loadPolicyCorpora()) {
    for (const clause of corpus.clauses) {
      map.set(`${corpus.source}:${clause.clauseId}`, {
        ...clause,
        source: corpus.source,
        corpusVersion: corpus.corpusVersion,
      });
    }
  }
  return map;
}

let cachedMap: ReadonlyMap<string, ClauseWithMeta> | null = null;

function clauseMap(): ReadonlyMap<string, ClauseWithMeta> {
  if (!cachedMap) cachedMap = buildClauseMap();
  return cachedMap;
}

/**
 * Returns the full clause record for `(source, clauseId)` or `null`
 * when no matching clause exists in the corpus.
 */
export function getClauseById(source: CorpusSource, clauseId: string): ClauseWithMeta | null {
  return clauseMap().get(`${source}:${clauseId}`) ?? null;
}

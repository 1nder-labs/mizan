/**
 * `searchPolicyVectorize(env, query, limit)` — semantic policy search for
 * the copilot `search_policy` tool. Embeds the reviewer's free-text query
 * with the same model used to embed the corpus, queries the Vectorize
 * index (the chunks committed by `scripts/embed-corpus`), and resolves each
 * match's `clauseId` back to its whole clause via the bundled corpus map.
 *
 * Mirrors the brief pipeline's `steps/matchPolicy` retrieval, minus the
 * case-derived source filter: a reviewer asking "what does policy say about
 * X?" has no case context, so both corpora (zakat + safety) are in scope.
 */
import type { VectorizeIndex, VectorizeMatch } from "@cloudflare/workers-types";
import type { EmbeddingEnv } from "../models/embedding-factory.ts";
import { resolveQueryEmbedding } from "../runtime/model-resolver.ts";
import { getClauseById, type CorpusSource } from "./lookup.ts";

/** One semantically-ranked clause hit returned by `searchPolicyVectorize`. */
export interface PolicySearchHit {
  readonly clauseId: string;
  readonly source: CorpusSource;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
}

/** Vectorize binding handle the policy search needs from the worker env. */
export interface PolicyVectorSearchEnv {
  readonly VECTORIZE: VectorizeIndex;
}

const SNIPPET_LENGTH = 240;
const MAX_TOP_K = 10;

function clampScore(score: number): number {
  if (!Number.isFinite(score) || score < 0) return 0;
  return score > 1 ? 1 : score;
}

function isCorpusSource(value: unknown): value is CorpusSource {
  return value === "zakat" || value === "safety";
}

function snippetOf(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= SNIPPET_LENGTH) return trimmed;
  return `${trimmed.slice(0, SNIPPET_LENGTH).trimEnd()}…`;
}

function matchToHit(match: VectorizeMatch): PolicySearchHit | null {
  const clauseId = match.metadata?.clauseId;
  const source = match.metadata?.source;
  if (typeof clauseId !== "string" || !isCorpusSource(source)) return null;
  const clause = getClauseById(source, clauseId);
  if (!clause) return null;
  return {
    clauseId,
    source,
    title: clause.title,
    snippet: snippetOf(clause.body),
    score: clampScore(match.score),
  };
}

/**
 * Returns up to `limit` (capped at 10) clauses ranked by semantic similarity
 * to `query`. Matches whose `clauseId` is absent from the deployed corpus
 * (version drift) are dropped, matching `matchPolicy`'s behavior.
 */
export async function searchPolicyVectorize(
  env: PolicyVectorSearchEnv & EmbeddingEnv,
  query: string,
  limit: number,
): Promise<PolicySearchHit[]> {
  const topK = Math.min(Math.max(1, limit), MAX_TOP_K);
  const embedding = await resolveQueryEmbedding(env, query);
  const result = await env.VECTORIZE.query(embedding, { topK, returnMetadata: "all" });
  const hits: PolicySearchHit[] = [];
  for (const match of result.matches) {
    const hit = matchToHit(match);
    if (hit) hits.push(hit);
  }
  return hits;
}

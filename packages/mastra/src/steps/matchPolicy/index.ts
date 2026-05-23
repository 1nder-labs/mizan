import { createStep } from "@mastra/core/workflows";
import type { VectorizeIndex } from "@cloudflare/workers-types";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getEnv } from "../../runtime/context-accessors.ts";
import { resolveQueryEmbedding } from "../../runtime/model-resolver.ts";
import type { PolicyCitation } from "@mizan/shared";
import { PartialBriefStateSchema } from "../../schemas/partial-brief-state.ts";
import { loadPolicyCorpora } from "../../corpus/load.ts";
import {
  buildPolicyQuery,
  parseMatchToCitation,
  resolveExcerptMap,
  resolvePolicySource,
} from "./helpers.ts";

const TOP_K = 8;

let excerptByClauseId: ReadonlyMap<string, string> | null = null;
function getExcerptMap(): ReadonlyMap<string, string> {
  if (!excerptByClauseId) excerptByClauseId = resolveExcerptMap(loadPolicyCorpora());
  return excerptByClauseId;
}

async function queryVectorizeWithFallback(
  vectorize: VectorizeIndex,
  embedding: number[],
  source: "zakat" | "safety",
  caseId: string,
): Promise<PolicyCitation[]> {
  try {
    const matches = await vectorize.query(embedding, {
      topK: TOP_K,
      returnMetadata: "all",
      filter: { source: { $eq: source } },
    });
    const excerptMap = getExcerptMap();
    return matches.matches
      .map((match) => parseMatchToCitation(match, excerptMap))
      .filter((citation): citation is NonNullable<typeof citation> => citation !== null);
  } catch (error) {
    console.warn(
      `[matchPolicy] vectorize.query failed for case=${caseId} source=${source} — returning empty policy_matches: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

export const matchPolicy = createStep({
  id: "matchPolicy",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const query = buildPolicyQuery(caseRow, inputData);
    const source = resolvePolicySource(caseRow.claimed_zakat_category);
    const embedding = await resolveQueryEmbedding(env, query, { abortSignal });
    const policy_matches = await queryVectorizeWithFallback(
      env.VECTORIZE,
      embedding,
      source,
      inputData.caseId,
    );
    return { ...inputData, policy_matches };
  },
});

import { createStep } from "@mastra/core/workflows";
import type { VectorizeIndex } from "@cloudflare/workers-types";
import { traceTool } from "../shared/trace-tool.ts";
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

async function queryVectorize(
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
  } catch (cause) {
    throw new Error(
      `matchPolicy: vectorize.query failed (case_id=${caseId} source=${source}): ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
}

export const matchPolicy = createStep({
  id: "matchPolicy",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal, tracingContext }) => {
    const env = getEnv(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const query = buildPolicyQuery(caseRow, inputData);
    const source = resolvePolicySource(caseRow.claimed_zakat_category);
    const embedding = await traceTool(tracingContext, "policyEmbedding", { source }, () =>
      resolveQueryEmbedding(env, query, { abortSignal }),
    );
    const policy_matches = await traceTool(
      tracingContext,
      "vectorizePolicySearch",
      { source },
      () => queryVectorize(env.VECTORIZE, embedding, source, inputData.caseId),
    );
    return { ...inputData, policy_matches };
  },
});

import { createStep } from "@mastra/core/workflows";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getEnv } from "../../runtime/context-accessors.ts";
import { resolveQueryEmbedding } from "../../runtime/model-resolver.ts";
import { PartialBriefStateSchema } from "../../schemas/brief.ts";
import { loadPolicyCorpora } from "../../corpus/load.ts";
import {
  buildPolicyQuery,
  parseMatchToCitation,
  resolveExcerptMap,
  resolvePolicySource,
} from "./helpers.ts";

const TOP_K = 8;

const EXCERPT_BY_CLAUSE_ID = resolveExcerptMap(loadPolicyCorpora());

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
    const matches = await env.VECTORIZE.query(embedding, {
      topK: TOP_K,
      returnMetadata: "all",
      filter: { source: { $eq: source } },
    });
    const policy_matches = matches.matches
      .map((match) => parseMatchToCitation(match, EXCERPT_BY_CLAUSE_ID))
      .filter((citation): citation is NonNullable<typeof citation> => citation !== null);
    return { ...inputData, policy_matches };
  },
});

import { createStep } from "@mastra/core/workflows";
import { embedPolicyText } from "../../models/embedding-factory.ts";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getEnv } from "../../runtime/context-accessors.ts";
import { PartialBriefStateSchema } from "../../schemas/brief.ts";
import { loadPolicyCorpora } from "../../corpus/load.ts";
import {
  buildPolicyQuery,
  parseMatchToCitation,
  resolveExcerptMap,
  resolvePolicySource,
} from "./helpers.ts";

const TOP_K = 8;

/**
 * Module-scoped excerpt lookup — corpora are committed JSON loaded once at import,
 * so the map never changes across requests. Hoisted out of `execute` to avoid
 * rebuilding ~60 entries per workflow run.
 */
const EXCERPT_BY_CLAUSE_ID = resolveExcerptMap(loadPolicyCorpora());

/** Embeds extracted claims and queries Vectorize for relevant policy clauses. */
export const matchPolicy = createStep({
  id: "matchPolicy",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext }) => {
    const env = getEnv(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const query = buildPolicyQuery(caseRow, inputData);
    const source = resolvePolicySource(caseRow.claimed_zakat_category);
    const embedding = await embedPolicyText(env, query);
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

import { createStep } from "@mastra/core/workflows";
import { loadCaseContext } from "../runtime/case-loader.ts";
import { tierFor } from "../runtime/geography-tier.ts";
import { getEnv } from "../runtime/context-accessors.ts";
import { PartialBriefStateSchema } from "../schemas/brief.ts";

/** Emits category, geography tier, and a documentary placeholder verification path. */
export const classifyCampaign = createStep({
  id: "classifyCampaign",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext }) => {
    const env = getEnv(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const geography_tier = tierFor(caseRow.geography);
    return {
      ...inputData,
      classify: {
        category: caseRow.category,
        verification_path: "documentary" as const,
        geography_tier,
      },
    };
  },
});

import { createStep } from "@mastra/core/workflows";
import { loadCaseContext } from "../runtime/case-loader.ts";
import { tierFor } from "../runtime/geography-tier.ts";
import { getEnv } from "../runtime/context-accessors.ts";
import { PartialBriefStateSchema, VerificationPathSchema } from "../schemas/brief.ts";

const INITIAL_VERIFICATION_PATH = VerificationPathSchema.parse("documentary");

/**
 * Emits category, geography tier, and an initial verification path.
 *
 * The verification path is overwritten by `computeVerificationPath` once the
 * extractor + vouching signals have produced their outputs; `documentary` is
 * the conservative seed value (will be downgraded if extractions are missing).
 */
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
        verification_path: INITIAL_VERIFICATION_PATH,
        geography_tier,
      },
    };
  },
});

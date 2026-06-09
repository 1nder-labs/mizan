import { createStep } from "@mastra/core/workflows";
import { loadCaseContext } from "../runtime/case-loader.ts";
import { tierFor } from "../runtime/geography-tier.ts";
import { getEnv } from "../runtime/context-accessors.ts";
import { VerificationPathSchema } from "@mizan/shared";
import { PartialBriefStateSchema } from "../schemas/partial-brief-state.ts";

/**
 * Conservative initial verification-path seed.
 *
 * `computeVerificationPath` overwrites this once extractors + vouching
 * signals have produced their outputs. If a workflow refactor ever
 * accidentally skipped or reordered `computeVerificationPath`, the
 * residual seed would flow into `forcedEscalateGate`. Seeding `none`
 * over-escalates an OFAC case on misconfiguration; seeding `documentary`
 * would let the gate silently no-op. Over-escalation is strictly safer
 * than under-escalation in the trust-and-safety domain.
 */
const INITIAL_VERIFICATION_PATH = VerificationPathSchema.parse("none");

/**
 * Emits category, geography tier, and a conservative initial verification path.
 * `computeVerificationPath` overwrites the path later in the workflow.
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

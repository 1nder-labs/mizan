import { createStep } from "@mastra/core/workflows";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getEnv } from "../../runtime/context-accessors.ts";
import { PartialBriefStateSchema, type BriefPayload } from "../../schemas/brief.ts";
import { updatePersistedBrief } from "../composeBrief/run.ts";
import { forceEscalate } from "./predicate.ts";

/** Overrides non-ESCALATE recommendations when high-risk geography has no verification path. */
export const forcedEscalateGate = createStep({
  id: "forcedEscalateGate",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext }) => {
    const brief = inputData.brief;
    const classify = inputData.classify;
    if (!brief || !classify) {
      return inputData;
    }
    const shouldForce = forceEscalate({
      recommendation: brief.recommendation,
      verification_path: classify.verification_path,
      geography_tier: classify.geography_tier,
    });
    if (!shouldForce) {
      return inputData;
    }
    const env = getEnv(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const forced_escalate_reason =
      `verification_path=${classify.verification_path} + geography_tier=${classify.geography_tier} ` +
      `(case in ${caseRow.geography}: no documentary chain, high-risk jurisdiction)`;
    const updatedBrief: BriefPayload = {
      ...brief,
      recommendation: "ESCALATE",
      forced_escalate_reason,
    };
    await updatePersistedBrief(env, inputData.caseId, inputData.runId, updatedBrief);
    return { ...inputData, brief: updatedBrief };
  },
});

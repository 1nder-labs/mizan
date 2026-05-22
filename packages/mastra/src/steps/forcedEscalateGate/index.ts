import { createStep } from "@mastra/core/workflows";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { PartialBriefStateSchema, type BriefPayload } from "../../schemas/brief.ts";
import { updatePersistedBrief } from "../shared/updateBrief.ts";
import { forceEscalate } from "./predicate.ts";

/**
 * Overrides non-ESCALATE/non-BLOCK recommendations when high-risk geography
 * has no verification path.
 *
 * Fails loud when state is incomplete: a missing `brief` or `classify` means
 * the workflow upstream failed without raising, and a silent pass-through
 * could let a high-risk no-verification case escape escalation.
 */
export const forcedEscalateGate = createStep({
  id: "forcedEscalateGate",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext }) => {
    const { brief, classify } = inputData;
    if (!brief) {
      throw new Error(
        `forcedEscalateGate: brief missing for case ${inputData.caseId} run ${inputData.runId}`,
      );
    }
    if (!classify) {
      throw new Error(
        `forcedEscalateGate: classify missing for case ${inputData.caseId} run ${inputData.runId}`,
      );
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
    const ctx = getCtx(requestContext);
    const forced_escalate_reason =
      `verification_path=${classify.verification_path} + geography_tier=${classify.geography_tier} ` +
      `(case in ${ctx.geography}: no documentary chain, high-risk jurisdiction)`;
    const updatedBrief: BriefPayload = {
      ...brief,
      recommendation: "ESCALATE",
      forced_escalate_reason,
    };
    await updatePersistedBrief({
      env,
      caseId: inputData.caseId,
      runId: inputData.runId,
      brief: updatedBrief,
    });
    return { ...inputData, brief: updatedBrief };
  },
});

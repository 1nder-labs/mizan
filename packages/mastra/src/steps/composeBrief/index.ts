import { createStep } from "@mastra/core/workflows";
import { clampInt } from "@mizan/shared";
import { PartialBriefStateSchema, type BriefPayload } from "../../schemas/brief.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { persistBrief, runComposeBriefGeneration } from "./run.ts";

export const composeBrief = createStep({
  id: "composeBrief",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const policyMatches = inputData.policy_matches ?? [];
    if (policyMatches.length === 0) {
      console.warn(
        `[composeBrief] degraded: zero policy_matches for case=${inputData.caseId} run=${inputData.runId} — brief will lack policy grounding`,
      );
    }
    const composed = normalizeBrief(
      await runComposeBriefGeneration({ env, ctx, inputData, abortSignal }, policyMatches),
    );
    await persistBrief(env, inputData.caseId, inputData.runId, composed);
    return { ...inputData, brief: composed };
  },
});

function normalizeBrief(payload: BriefPayload): BriefPayload {
  return {
    ...payload,
    confidence: clampInt(payload.confidence, 0, 100),
  };
}

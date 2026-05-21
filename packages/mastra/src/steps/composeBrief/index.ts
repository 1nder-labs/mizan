import { createStep } from "@mastra/core/workflows";
import { clampInt } from "@mizan/shared";
import { PartialBriefStateSchema, type BriefPayload } from "../../schemas/brief.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { persistBrief, runComposeBriefGeneration } from "./run.ts";

/** Reasoning step — composes BriefPayload and persists to D1. */
export const composeBrief = createStep({
  id: "composeBrief",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const policyMatches = inputData.policy_matches ?? [];
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

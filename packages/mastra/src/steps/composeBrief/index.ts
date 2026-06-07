import { createStep } from "@mastra/core/workflows";
import { makeDb } from "@mizan/db";
import { clampInt } from "@mizan/shared";
import type { BriefPayload } from "@mizan/shared";
import { PartialBriefStateSchema } from "../../schemas/partial-brief-state.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { persistBrief, runComposeBriefGeneration } from "./run.ts";
import { fetchPriorDecision } from "./prior-decision.ts";

/**
 * Composes the reviewer brief and persists it.
 *
 * `verification_path` and `geography_tier` are deterministic values
 * produced by upstream steps; we never ask the LLM to emit them. They are
 * stitched onto the BriefPayload here so downstream consumers (UI, eval,
 * reviewer queue) can audit the gate inputs directly from `briefs.payload_json`
 * without parsing `forced_escalate_reason` strings.
 */
export const composeBrief = createStep({
  id: "composeBrief",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal, tracingContext }) => {
    if (!inputData.classify) {
      throw new Error(
        `composeBrief: classify missing for case ${inputData.caseId} run ${inputData.runId} — classifyCampaign + computeVerificationPath must run first`,
      );
    }
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const priorDecision = await fetchPriorDecision(
      makeDb(env.DB),
      inputData.caseId,
      inputData.runId,
    );
    const policyMatches = inputData.policy_matches ?? [];
    if (policyMatches.length === 0) {
      console.warn(
        `[composeBrief] degraded: zero policy_matches for case=${inputData.caseId} run=${inputData.runId} — brief will lack policy grounding`,
      );
    }
    const llmOutput = await runComposeBriefGeneration(
      { env, ctx, inputData, abortSignal, tracingContext, priorDecision },
      policyMatches,
    );
    const composed = normalizeBrief({
      ...llmOutput,
      verification_path: inputData.classify.verification_path,
      geography_tier: inputData.classify.geography_tier,
      policy_grounded: policyMatches.length > 0,
    });
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

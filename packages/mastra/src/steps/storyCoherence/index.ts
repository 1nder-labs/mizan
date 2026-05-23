import { createStep } from "@mastra/core/workflows";
import { StoryCoherencePayloadSchema, clampUnit, type StoryCoherencePayload } from "@mizan/shared";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import { PartialBriefStateSchema } from "../../schemas/partial-brief-state.ts";
import { runStructuredLlm } from "../shared/runStructuredLlm.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import { STORY_COHERENCE_SYSTEM, buildStoryCoherencePayload } from "./prompt.ts";

/**
 * Evaluates campaign story coherence via extractor-tier structured output.
 *
 * Density + template-match scores carry a `caller clamps to [0,1]` contract
 * in the schema; we enforce that contract here with `clampUnit` so a
 * malformed LLM emission cannot push out-of-band values through the
 * workflow into `signals.payload_json`.
 */
export const storyCoherence = createStep({
  id: "storyCoherence",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const raw = await runStructuredLlm({
      env,
      ctx,
      stepName: "storyCoherence",
      schemaName: "storyCoherence.evaluate",
      modelKind: "extract",
      schema: StoryCoherencePayloadSchema,
      system: STORY_COHERENCE_SYSTEM,
      userPayload: buildStoryCoherencePayload(caseRow, inputData),
      abortSignal,
    });
    const payload = normalizeStorySignal(raw);
    await upsertSignal({
      env,
      caseId: inputData.caseId,
      runId: inputData.runId,
      signalType: "story_coherence",
      payload,
    });
    return {
      ...inputData,
      signals: { ...inputData.signals, story: payload },
    };
  },
});

/** Clamps LLM scores into [0,1] per the schema contract. */
export function normalizeStorySignal(payload: StoryCoherencePayload): StoryCoherencePayload {
  return {
    named_entity_density: clampUnit(payload.named_entity_density),
    template_match_score: clampUnit(payload.template_match_score),
    coherence_summary: payload.coherence_summary,
  };
}

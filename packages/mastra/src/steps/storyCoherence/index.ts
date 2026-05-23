import { StoryCoherencePayloadSchema, clampUnit, type StoryCoherencePayload } from "@mizan/shared";
import { makeLlmSignalStep } from "../shared/makeLlmSignalStep.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import { STORY_COHERENCE_SYSTEM, buildStoryCoherencePayload } from "./prompt.ts";

/**
 * Evaluates campaign story coherence via extractor-tier structured output.
 *
 * Density + template-match scores carry a `caller clamps to [0,1]` contract
 * in the schema; `normalizeStorySignal` enforces that contract so a
 * malformed LLM emission cannot push out-of-band values through the
 * workflow into `signals.payload_json`. The factory wires the load-case →
 * LLM → post-process → upsertSignal → merge-into-state skeleton; this
 * file declares only the slot-specific pieces.
 */
export const storyCoherence = makeLlmSignalStep<StoryCoherencePayload>({
  id: "storyCoherence",
  schemaName: "storyCoherence.evaluate",
  modelKind: "extract",
  schema: StoryCoherencePayloadSchema,
  system: STORY_COHERENCE_SYSTEM,
  buildUserPayload: ({ caseRow, inputData }) => buildStoryCoherencePayload(caseRow, inputData),
  postProcess: ({ raw }) => normalizeStorySignal(raw),
  persist: ({ env, caseId, runId, payload }) =>
    upsertSignal({ env, caseId, runId, signalType: "story_coherence", payload }),
  mergeIntoState: (state, payload) => ({
    ...state,
    signals: { ...state.signals, story: payload },
  }),
});

/** Clamps LLM scores into [0,1] per the schema contract. */
export function normalizeStorySignal(payload: StoryCoherencePayload): StoryCoherencePayload {
  return {
    named_entity_density: clampUnit(payload.named_entity_density),
    template_match_score: clampUnit(payload.template_match_score),
    coherence_summary: payload.coherence_summary,
  };
}

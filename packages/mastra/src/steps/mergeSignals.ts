import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { PartialBriefStateSchema } from "../schemas/brief.ts";

/**
 * Re-joins the three signal-emitting parallel branches back into a single
 * `PartialBriefStateSchema`. Mastra `.parallel([...])` produces an object
 * keyed by step id; `mergeSignals` is the canonical "wide branch → narrow
 * state" reducer so every downstream step keeps the standard input shape.
 *
 * Non-signals fields (`caseId`, `runId`, `classify`, `extractions`, …) are
 * identical across all three branches because each branch starts from the
 * same upstream input and only mutates its own `signals.*` slot. Any
 * branch can therefore serve as the canonical non-signals base.
 */
const ParallelSignalsInputSchema = z.object({
  photoSignal: PartialBriefStateSchema,
  storyCoherence: PartialBriefStateSchema,
  classifyVouchingChain: PartialBriefStateSchema,
});

export const mergeSignals = createStep({
  id: "mergeSignals",
  inputSchema: ParallelSignalsInputSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData }) => {
    const base = inputData.photoSignal;
    const photo = inputData.photoSignal.signals?.photo;
    const story = inputData.storyCoherence.signals?.story;
    const vouching = inputData.classifyVouchingChain.signals?.vouching;
    return {
      ...base,
      signals: {
        ...base.signals,
        ...(photo ? { photo } : {}),
        ...(story ? { story } : {}),
        ...(vouching ? { vouching } : {}),
      },
    };
  },
});

import { createStep } from "@mastra/core/workflows";
import { ClassifyOutputSchema } from "../schemas/classify.ts";
import { PartialBriefStateSchema } from "../schemas/brief.ts";

const DOCUMENTARY_PATH = ClassifyOutputSchema.shape.verification_path.enum.documentary;

/** Deterministic documentary classifier — Phase 4 adds trust-signal branching. */
export const classifyCampaign = createStep({
  id: "classifyCampaign",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData }) => ({
    ...inputData,
    classify: { verification_path: DOCUMENTARY_PATH },
  }),
});

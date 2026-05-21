import { createStep } from "@mastra/core/workflows";
import { BriefPayloadSchema, PartialBriefStateSchema } from "../schemas/brief.ts";

/**
 * Phase 7 replaces this pass-through with `.suspend()` HITL.
 * Phase 2 returns the composed brief as the workflow terminal output.
 */
export const awaitReviewerAction = createStep({
  id: "awaitReviewerAction",
  inputSchema: PartialBriefStateSchema,
  outputSchema: BriefPayloadSchema,
  execute: async ({ inputData }) => {
    if (!inputData.brief) {
      throw new Error("composeBrief must populate brief before awaitReviewerAction");
    }
    return inputData.brief;
  },
});

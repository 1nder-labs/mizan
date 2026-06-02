import { createStep } from "@mastra/core/workflows";
import { makeDb } from "@mizan/db";
import { PartialBriefStateSchema } from "../schemas/partial-brief-state.ts";
import {
  ReviewerActionResumeSchema,
  ReviewerActionStepStateSchema,
  ReviewerActionSuspendSchema,
} from "../schemas/reviewer-action-suspend.ts";
import { getEnv } from "../runtime/context-accessors.ts";
import { mergeResumeAction, prepareReviewerSuspend } from "./await-reviewer-action-helpers.ts";

export {
  ReviewerActionStepStateSchema,
  type ReviewerActionStepState,
} from "../schemas/reviewer-action-suspend.ts";

/**
 * HITL gate — suspends after composeBrief so the reviewer can act.
 * On resume, forwards the validated action payload to `recordAction`.
 */
export const awaitReviewerAction = createStep({
  id: "awaitReviewerAction",
  inputSchema: PartialBriefStateSchema,
  outputSchema: ReviewerActionStepStateSchema,
  resumeSchema: ReviewerActionResumeSchema,
  suspendSchema: ReviewerActionSuspendSchema,
  execute: async ({ inputData, resumeData, suspend, requestContext }) => {
    if (!inputData.brief) {
      throw new Error("composeBrief must populate brief before awaitReviewerAction");
    }

    if (resumeData !== undefined) {
      return mergeResumeAction(inputData, resumeData);
    }

    const db = makeDb(getEnv(requestContext).DB);
    const payload = await prepareReviewerSuspend(db, { ...inputData, brief: inputData.brief });
    return suspend(payload);
  },
});

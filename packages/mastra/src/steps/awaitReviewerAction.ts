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

    /**
     * Shadow resume path — never taken at runtime. This workflow does not call
     * `run.resume()`: Cloudflare Workers' cross-request I/O isolation blocks
     * resuming a run from a different request than its `stream()`, so the
     * post-suspend chain (record / promote / finalize) runs inline in
     * `POST /api/cases/:id/action` (apps/worker/src/routes/actions.ts). The
     * branch is retained because Mastra's step contract still supplies
     * `resumeData`/`resumeSchema`, and it fails safe — were Mastra-native resume
     * ever wired, the action would merge rather than silently re-suspend. See
     * docs/solutions/architecture-patterns/durable-resumable-brief-stream-do.md.
     */
    if (resumeData !== undefined) {
      return mergeResumeAction(inputData, resumeData);
    }

    const db = makeDb(getEnv(requestContext).DB);
    const payload = await prepareReviewerSuspend(db, { ...inputData, brief: inputData.brief });
    return suspend(payload);
  },
});

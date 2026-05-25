import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { getEnv } from "../runtime/context-accessors.ts";
import { ReviewerActionStepStateSchema } from "../schemas/reviewer-action-suspend.ts";
import {
  claimResumeAndEmit,
  openRecordActionDb,
  persistReviewerActionRow,
  withPersistedActionId,
} from "./record-action-helpers.ts";

const RecordActionOutputSchema = ReviewerActionStepStateSchema.extend({
  persistedActionId: z.string().uuid(),
});

export type { RecordActionOutput } from "./record-action-helpers.ts";

export { RecordActionOutputSchema };

/**
 * Persists the reviewer's action after resume. Idempotent on `action_id`.
 */
export const recordAction = createStep({
  id: "recordAction",
  inputSchema: ReviewerActionStepStateSchema,
  outputSchema: RecordActionOutputSchema,
  execute: async ({ inputData, requestContext }) => {
    const db = openRecordActionDb(getEnv(requestContext));
    await claimResumeAndEmit(db, inputData);
    const persistedActionId = await persistReviewerActionRow(db, inputData);
    return withPersistedActionId(inputData, persistedActionId);
  },
});

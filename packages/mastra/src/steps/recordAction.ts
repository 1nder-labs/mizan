import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { makeDb } from "@mizan/db";
import { getEnv } from "../runtime/context-accessors.ts";
import { ReviewerActionStepStateSchema } from "../schemas/reviewer-action-suspend.ts";
import { emitResumeEvent, persistReviewerActionRow } from "./record-action-helpers.ts";

const RecordActionOutputSchema = ReviewerActionStepStateSchema.extend({
  persistedActionId: z.string().uuid(),
});

export { RecordActionOutputSchema };

/**
 * Persists the reviewer's action after resume. Idempotent on `action_id`.
 */
export const recordAction = createStep({
  id: "recordAction",
  inputSchema: ReviewerActionStepStateSchema,
  outputSchema: RecordActionOutputSchema,
  execute: async ({ inputData, requestContext }) => {
    const db = makeDb(getEnv(requestContext).DB);
    await emitResumeEvent(db, inputData);
    const persistedActionId = await persistReviewerActionRow(db, inputData);
    return { ...inputData, persistedActionId };
  },
});

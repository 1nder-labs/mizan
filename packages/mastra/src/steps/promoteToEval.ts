import { createStep } from "@mastra/core/workflows";
import { eval_promotions, makeDb } from "@mizan/db";
import { PartialBriefStateSchema } from "../schemas/partial-brief-state.ts";
import { getEnv } from "../runtime/context-accessors.ts";
import { RecordActionOutputSchema } from "./recordAction.ts";

/**
 * Appends an eval-promotion ledger row after the reviewer action
 * persists. Idempotent on `(run_id, action_id)`.
 */
export const promoteToEval = createStep({
  id: "promoteToEval",
  inputSchema: RecordActionOutputSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext }) => {
    if (!inputData.brief) {
      throw new Error(
        `promoteToEval: brief missing for case ${inputData.caseId} run ${inputData.runId}`,
      );
    }

    const env = getEnv(requestContext);
    const db = makeDb(env.DB);

    await db
      .insert(eval_promotions)
      .values({
        case_id: inputData.caseId,
        run_id: inputData.runId,
        action_id: inputData.reviewerAction.action_id,
        recommendation: inputData.brief.recommendation,
        reviewer_action: inputData.reviewerAction.action,
      })
      .onConflictDoNothing({
        target: [eval_promotions.run_id, eval_promotions.action_id],
      });

    return {
      caseId: inputData.caseId,
      runId: inputData.runId,
      brief: inputData.brief,
    };
  },
});

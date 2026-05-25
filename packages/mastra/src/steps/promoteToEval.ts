import { createStep } from "@mastra/core/workflows";
import { makeDb } from "@mizan/db";
import { PartialBriefStateSchema } from "../schemas/partial-brief-state.ts";
import { getEnv } from "../runtime/context-accessors.ts";
import { RecordActionOutputSchema } from "./recordAction.ts";
import { promoteEvalRow } from "./promote-to-eval-helpers.ts";

/**
 * Appends an eval-promotion ledger row after the reviewer action
 * persists. Idempotent on `(run_id, action_id)` — insert delegates to
 * the unit-testable `promoteEvalRow` helper.
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
    await promoteEvalRow(makeDb(getEnv(requestContext).DB), {
      caseId: inputData.caseId,
      runId: inputData.runId,
      actionId: inputData.reviewerAction.action_id,
      recommendation: inputData.brief.recommendation,
      reviewerAction: inputData.reviewerAction.action,
    });
    return {
      caseId: inputData.caseId,
      runId: inputData.runId,
      brief: inputData.brief,
    };
  },
});

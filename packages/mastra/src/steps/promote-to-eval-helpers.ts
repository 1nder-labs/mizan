import { eval_promotions, type Db } from "@mizan/db";
import type { Recommendation, ReviewerAction } from "@mizan/shared";

export interface PromoteEvalRowInput {
  readonly caseId: string;
  readonly runId: string;
  readonly actionId: string;
  readonly recommendation: Recommendation;
  readonly reviewerAction: ReviewerAction;
}

/**
 * Writes an eval-promotion ledger row, dedup'd on `(run_id, action_id)`.
 * Pure helper extracted from `promoteToEval.execute` so the insert path
 * is unit-testable against Miniflare D1 without spinning up a Mastra
 * workflow runtime.
 */
export async function promoteEvalRow(db: Db, input: PromoteEvalRowInput): Promise<void> {
  await db
    .insert(eval_promotions)
    .values({
      case_id: input.caseId,
      run_id: input.runId,
      action_id: input.actionId,
      recommendation: input.recommendation,
      reviewer_action: input.reviewerAction,
    })
    .onConflictDoNothing({
      target: [eval_promotions.run_id, eval_promotions.action_id],
    });
}

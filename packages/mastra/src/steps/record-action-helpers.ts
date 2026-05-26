import { eq, reviewer_actions, type Db } from "@mizan/db";
import { emitWorkflowEvent } from "../observability/workflow-event-logger.ts";
import type { ReviewerActionStepState } from "../schemas/reviewer-action-suspend.ts";

const EMPTY_RATIONALE = "(none)";

/**
 * Normalizes optional reviewer rationale to satisfy the DB min-length
 * constraint while preserving the reviewer's literal text when present.
 */
export function normalizeStoredRationale(rationale: string): string {
  const trimmed = rationale.trim();
  return trimmed.length > 0 ? trimmed : EMPTY_RATIONALE;
}

/**
 * Emits the resume workflow event. The route layer already claimed
 * SUSPENDED_HITL → RUNNING atomically before calling `run.resume`, so
 * the step does not re-flip status here.
 */
export async function emitResumeEvent(db: Db, inputData: ReviewerActionStepState): Promise<void> {
  await emitWorkflowEvent(db, {
    caseId: inputData.caseId,
    runId: inputData.runId,
    eventType: "step.resume",
    stepId: "recordAction",
  });
}

/** Writes or reuses the reviewer_actions row keyed by action_id. */
export async function persistReviewerActionRow(
  db: Db,
  inputData: ReviewerActionStepState,
): Promise<string> {
  const storedRationale = normalizeStoredRationale(inputData.reviewerAction.rationale);

  await db
    .insert(reviewer_actions)
    .values({
      case_id: inputData.caseId,
      run_id: inputData.runId,
      reviewer_id: inputData.reviewerAction.reviewer_id,
      action: inputData.reviewerAction.action,
      rationale: storedRationale,
      action_id: inputData.reviewerAction.action_id,
    })
    .onConflictDoNothing({ target: reviewer_actions.action_id });

  const row = await db
    .select({ id: reviewer_actions.id })
    .from(reviewer_actions)
    .where(eq(reviewer_actions.action_id, inputData.reviewerAction.action_id))
    .get();
  if (!row) {
    throw new Error(
      `recordAction: row missing after insert for action_id ${inputData.reviewerAction.action_id}`,
    );
  }
  return row.id;
}

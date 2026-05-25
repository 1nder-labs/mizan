import { and, briefs, eq, makeDb, transitionCase, type Db } from "@mizan/db";
import type { BriefPayload } from "@mizan/shared";
import { emitWorkflowEvent } from "../observability/workflow-event-logger.ts";
import type { PartialBriefState } from "../schemas/partial-brief-state.ts";
import {
  ReviewerActionResumeSchema,
  type ReviewerActionResumeData,
  type ReviewerActionStepState,
  type ReviewerActionSuspendPayload,
} from "../schemas/reviewer-action-suspend.ts";

async function loadBriefId(db: Db, caseId: string, runId: string): Promise<string> {
  const briefRow = await db
    .select({ id: briefs.id })
    .from(briefs)
    .where(and(eq(briefs.case_id, caseId), eq(briefs.run_id, runId)))
    .get();
  if (!briefRow) {
    throw new Error(`awaitReviewerAction: brief row missing for case ${caseId} run ${runId}`);
  }
  return briefRow.id;
}

/** Resume path — validate payload and merge into workflow state. */
export function mergeResumeAction(
  inputData: PartialBriefState,
  resumeData: unknown,
): ReviewerActionStepState {
  const parsed: ReviewerActionResumeData = ReviewerActionResumeSchema.parse(resumeData);
  return {
    ...inputData,
    reviewerAction: parsed,
  };
}

/** Builds the suspend payload after status flip + workflow event emit. */
export async function prepareReviewerSuspend(
  db: Db,
  inputData: PartialBriefState & { brief: BriefPayload },
): Promise<ReviewerActionSuspendPayload> {
  const briefId = await loadBriefId(db, inputData.caseId, inputData.runId);

  const claimed = await transitionCase(db, {
    caseId: inputData.caseId,
    runId: inputData.runId,
    from: "RUNNING",
    to: "SUSPENDED_HITL",
  });
  if (!claimed) {
    throw new Error(
      `awaitReviewerAction: case ${inputData.caseId} not RUNNING for run ${inputData.runId}`,
    );
  }

  await emitWorkflowEvent(db, {
    caseId: inputData.caseId,
    runId: inputData.runId,
    eventType: "step.suspend",
    stepId: "awaitReviewerAction",
    payloadMeta: {
      awaiting: "reviewer_action",
      caseId: inputData.caseId,
      runId: inputData.runId,
      briefId,
    },
  });

  return {
    awaiting: "reviewer_action",
    caseId: inputData.caseId,
    runId: inputData.runId,
    briefId,
    brief: inputData.brief,
  };
}

/** Opens a DB handle from the workflow request context env slot. */
export function openWorkflowDb(env: { DB: Parameters<typeof makeDb>[0] }): Db {
  return makeDb(env.DB);
}

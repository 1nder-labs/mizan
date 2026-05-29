import {
  batchTransitionWithEmits,
  buildActionEmits,
  resolveCaseOrganizationId,
  transitionCase,
  type Db,
} from "@mizan/db";
import type { ReviewerAction } from "@mizan/shared";

interface FinalizeActionInput {
  readonly caseId: string;
  readonly runId: string;
  readonly reviewerId: string;
  readonly action: ReviewerAction;
  readonly actionId: string;
}

/**
 * Flips a claimed case to ACTIONED and emits org/case live events atomically.
 */
export async function finalizeActionWithLiveEvents(
  db: Db,
  input: FinalizeActionInput,
): Promise<void> {
  const organizationId = await resolveCaseOrganizationId(db, input.caseId);
  const flipped = await batchTransitionWithEmits(
    db,
    {
      caseId: input.caseId,
      runId: input.runId,
      from: "RUNNING",
      to: "ACTIONED",
    },
    buildActionEmits({
      caseId: input.caseId,
      organizationId,
      actionId: input.actionId,
      reviewerId: input.reviewerId,
      action: input.action,
    }),
  );
  if (!flipped) {
    throw new Error(`action: case ${input.caseId} not RUNNING at finalize (run ${input.runId})`);
  }
}

/** Reverts a failed post-action chain back to SUSPENDED_HITL. */
export async function revertActionClaim(db: Db, caseId: string, runId: string): Promise<boolean> {
  const reverted = await transitionCase(db, {
    caseId,
    runId,
    from: "RUNNING",
    to: "SUSPENDED_HITL",
  });
  return Boolean(reverted);
}

export type { FinalizeActionInput };

import { batchTransitionWithEmits, buildActionEmits, transitionCase, type Db } from "@mizan/db";
import type { ReviewerAction } from "@mizan/shared";

interface FinalizeActionInput {
  readonly caseId: string;
  readonly runId: string;
  readonly reviewerId: string;
  readonly organizationId: string;
  readonly action: ReviewerAction;
  readonly actionId: string;
}

/**
 * Flips a claimed case to ACTIONED and emits org/case live events atomically.
 * The caller already holds the viewer's `organizationId` (the action route
 * scoped the case load to it), so we thread it through rather than re-reading
 * the row — one fewer D1 round-trip and no TOCTOU re-resolve window.
 */
export async function finalizeActionWithLiveEvents(
  db: Db,
  input: FinalizeActionInput,
): Promise<void> {
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
      organizationId: input.organizationId,
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

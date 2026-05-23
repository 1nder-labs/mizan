import { createStep } from "@mastra/core/workflows";
import { cases, eq, makeDb } from "@mizan/db";
import { getEnv } from "../runtime/context-accessors.ts";
import {
  PartialBriefStateSchema,
  type PartialBriefState,
} from "../schemas/partial-brief-state.ts";

/**
 * Asserts that the workflow state contains a brief by the time
 * `finalizeCaseStatus` runs. Lifted to a pure helper so unit tests can
 * pin the throw without spinning up a Mastra runtime.
 */
export function assertFinalizeCaseStatusInputs(state: PartialBriefState): void {
  if (!state.brief) {
    throw new Error(
      `finalizeCaseStatus: brief missing for case ${state.caseId} run ${state.runId}`,
    );
  }
}

/**
 * Builds the "case row not found" error message thrown when the status
 * UPDATE matched zero rows. Pure helper — exported so tests can pin
 * the exact triage tuple shape without invoking D1.
 */
export function buildCaseNotFoundError(caseId: string, runId: string): Error {
  return new Error(
    `finalizeCaseStatus: case ${caseId} not found (run ${runId}) — status flip did not occur`,
  );
}

/**
 * Terminal-step that flips `cases.status` to `READY_FOR_REVIEW`.
 *
 * Runs after `forcedEscalateGate` (the last step that can mutate the
 * brief). Splitting status transition out of `composeBrief.persistBrief`
 * closes a reviewer-visible race: previously the case turned
 * `READY_FOR_REVIEW` the moment composeBrief committed, even though
 * `draftOrganizerMessage` and `forcedEscalateGate` were still going to
 * mutate the brief 1–5 seconds later. A reviewer polling the readiness
 * status could observe REQUEST_DOCS while the gate was about to flip
 * the recommendation to ESCALATE — and act on the wrong brief.
 *
 * Idempotent: a queue-redelivered run that already flipped status
 * re-writes the same value.
 *
 * Uses `.returning({ id })` and asserts at least one row was updated.
 * A silent no-op (e.g. case row deleted under us, wrong case_id, FK
 * skew between workflow state and persisted rows) would otherwise let
 * the workflow finish "successfully" while leaving the case stuck in
 * RUNNING — invisible to reviewers and to the queue retry logic.
 */
export const finalizeCaseStatus = createStep({
  id: "finalizeCaseStatus",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext }) => {
    assertFinalizeCaseStatusInputs(inputData);
    const env = getEnv(requestContext);
    const db = makeDb(env.DB);
    const updated = await db
      .update(cases)
      .set({ status: "READY_FOR_REVIEW", updated_at: new Date() })
      .where(eq(cases.id, inputData.caseId))
      .returning({ id: cases.id });
    if (updated.length === 0) {
      throw buildCaseNotFoundError(inputData.caseId, inputData.runId);
    }
    return inputData;
  },
});

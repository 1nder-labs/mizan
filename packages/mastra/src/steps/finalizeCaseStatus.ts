import { createStep } from "@mastra/core/workflows";
import { makeDb, transitionCase } from "@mizan/db";
import { BriefPayloadSchema } from "@mizan/shared";
import { getEnv } from "../runtime/context-accessors.ts";
import { emitWorkflowEvent } from "../observability/workflow-event-logger.ts";
import type { BriefPayload } from "@mizan/shared";
import { PartialBriefStateSchema, type PartialBriefState } from "../schemas/partial-brief-state.ts";

/**
 * Asserts that the workflow state contains a brief by the time
 * `finalizeCaseStatus` runs. Lifted to a pure helper so unit tests can
 * pin the throw without spinning up a Mastra runtime.
 */
export function assertFinalizeCaseStatusInputs(
  state: PartialBriefState,
): asserts state is PartialBriefState & { brief: BriefPayload } {
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
 * Terminal-step that flips `cases.status` to `ACTIONED`.
 *
 * Runs LAST in the brief workflow — after
 * `awaitReviewerAction` → `recordAction` → `promoteToEval`. By the time
 * this step executes the reviewer has already submitted an action and
 * the corresponding `reviewer_actions` + `eval_promotions` rows are
 * persisted; the case is permanently CLOSED from the workflow's
 * perspective, so `ACTIONED` is the correct terminal status (not
 * `READY_FOR_REVIEW`, which would imply the reviewer has yet to act).
 *
 * Routes through the canonical `transitionCase` helper so the
 * `current_run_id` pin and source-status guard protect against:
 *   - a stale workflow completion overwriting a row that already
 *     advanced under a NEWER run (producer guard claimed a fresh
 *     runId);
 *   - a DLQ-flipped FAILED row being silently flipped back to
 *     `ACTIONED` by a late-arriving completion.
 *
 * The transition only matches `status = 'RUNNING'`; any other terminal
 * state means the row is no longer ours to advance, and we throw
 * `buildCaseNotFoundError` so the queue retry / DLQ machinery sees the
 * failure instead of silently completing.
 *
 * Idempotent within a run: a queue-redelivered run that already flipped
 * status sees `status = 'ACTIONED'` and throws on the second attempt —
 * the consumer's outer catch reverts the claim (which is a no-op
 * because `revertClaim` only matches RUNNING) and retries; the next
 * redelivery's `classifyRedelivery` returns `ack-terminal` and acks
 * cleanly.
 */
export const finalizeCaseStatus = createStep({
  id: "finalizeCaseStatus",
  inputSchema: PartialBriefStateSchema,
  outputSchema: BriefPayloadSchema,
  execute: async ({ inputData, requestContext }) => {
    assertFinalizeCaseStatusInputs(inputData);
    const db = makeDb(getEnv(requestContext).DB);
    const updated = await transitionCase(db, {
      caseId: inputData.caseId,
      runId: inputData.runId,
      from: "RUNNING",
      to: "ACTIONED",
    });
    if (!updated) {
      throw buildCaseNotFoundError(inputData.caseId, inputData.runId);
    }
    await emitWorkflowEvent(db, {
      caseId: inputData.caseId,
      runId: inputData.runId,
      eventType: "workflow.finish",
    });
    return inputData.brief;
  },
});

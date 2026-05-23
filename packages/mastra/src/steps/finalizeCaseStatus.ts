import { createStep } from "@mastra/core/workflows";
import { cases, eq, makeDb } from "@mizan/db";
import { getEnv } from "../runtime/context-accessors.ts";
import { PartialBriefStateSchema } from "../schemas/partial-brief-state.ts";

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
 */
export const finalizeCaseStatus = createStep({
  id: "finalizeCaseStatus",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext }) => {
    if (!inputData.brief) {
      throw new Error(
        `finalizeCaseStatus: brief missing for case ${inputData.caseId} run ${inputData.runId}`,
      );
    }
    const env = getEnv(requestContext);
    const db = makeDb(env.DB);
    await db
      .update(cases)
      .set({ status: "READY_FOR_REVIEW", updated_at: new Date() })
      .where(eq(cases.id, inputData.caseId));
    return inputData;
  },
});

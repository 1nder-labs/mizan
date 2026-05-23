import { createStep } from "@mastra/core/workflows";
import { getCtx, getEnv } from "../../runtime/context-accessors.ts";
import {
  PartialBriefStateSchema,
  type BriefPayload,
  type PartialBriefState,
} from "../../schemas/brief.ts";
import { updatePersistedBrief } from "../shared/updateBrief.ts";
import { forceEscalate } from "./predicate.ts";

interface GateInputs {
  readonly brief: BriefPayload;
  readonly classify: NonNullable<PartialBriefState["classify"]>;
}

/**
 * Pure projection that escalates a brief. Strips
 * `drafted_organizer_message` because that field is REQUEST_DOCS-specific
 * by contract — leaving it on an ESCALATE brief would misrepresent the
 * recommendation to the reviewer. Exported for unit-level coverage so the
 * strip behaviour is pinned without needing to spin up a workflow.
 */
export function escalateBriefProjection(input: {
  readonly brief: BriefPayload;
  readonly forced_escalate_reason: string;
}): BriefPayload {
  const { drafted_organizer_message: _, ...stripped } = input.brief;
  return {
    ...stripped,
    recommendation: "ESCALATE",
    forced_escalate_reason: input.forced_escalate_reason,
  };
}

/**
 * Asserts the workflow state required by the forced-escalate gate.
 *
 * Fails loud when state is incomplete: a missing `brief` or `classify`
 * means an upstream step failed without raising, and a silent
 * pass-through could let a high-risk no-verification case escape
 * escalation. Exported for unit-level coverage of the guard rules.
 */
export function assertGateInputs(input: PartialBriefState): GateInputs {
  if (!input.brief) {
    throw new Error(
      `forcedEscalateGate: brief missing for case ${input.caseId} run ${input.runId}`,
    );
  }
  if (!input.classify) {
    throw new Error(
      `forcedEscalateGate: classify missing for case ${input.caseId} run ${input.runId}`,
    );
  }
  return { brief: input.brief, classify: input.classify };
}

/** Overrides non-ESCALATE/non-BLOCK recommendations when high-risk geography has no verification path. */
export const forcedEscalateGate = createStep({
  id: "forcedEscalateGate",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext }) => {
    const { brief, classify } = assertGateInputs(inputData);
    const shouldForce = forceEscalate({
      recommendation: brief.recommendation,
      verification_path: classify.verification_path,
      geography_tier: classify.geography_tier,
    });
    if (!shouldForce) {
      return inputData;
    }
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    const forced_escalate_reason =
      `verification_path=${classify.verification_path} + geography_tier=${classify.geography_tier} ` +
      `(case in ${ctx.geography}: no documentary chain, high-risk jurisdiction)`;
    const updatedBrief = escalateBriefProjection({ brief, forced_escalate_reason });
    await updatePersistedBrief({
      env,
      caseId: inputData.caseId,
      runId: inputData.runId,
      brief: updatedBrief,
    });
    return { ...inputData, brief: updatedBrief };
  },
});

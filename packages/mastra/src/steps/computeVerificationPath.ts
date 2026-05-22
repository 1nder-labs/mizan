import { createStep } from "@mastra/core/workflows";
import {
  PartialBriefStateSchema,
  type PartialBriefState,
  type VerificationPath,
} from "../schemas/brief.ts";

/** Collapses extractor + vouching outputs into the canonical verification path. */
export function deriveVerificationPath(state: PartialBriefState): VerificationPath {
  const extractions = state.extractions;
  const hasCreator = extractions?.extractCreatorIdDoc !== undefined;
  const hasBank = extractions?.extractBankStatement !== undefined;
  const hasCategory = extractions?.extractCategoryDocs !== undefined;
  if (hasCreator && hasBank && hasCategory) {
    return "documentary";
  }
  const structure = state.signals?.vouching?.structure;
  if (structure === "org-direct" || structure === "individual-via-partner-org") {
    return "institutional_vouching";
  }
  if (structure === "individual-to-individual") {
    return "community_vouching";
  }
  return "none";
}

/**
 * Deterministic step that overwrites `classify.verification_path`.
 *
 * Requires `classifyCampaign` to have run first — otherwise the geography
 * tier is unknown and downstream `forcedEscalateGate` would have no signal.
 * Throws instead of silently defaulting to `SAFE`, which would let an
 * OFAC-geography case with a missing classify escape the safety gate.
 */
export const computeVerificationPath = createStep({
  id: "computeVerificationPath",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData }) => {
    if (!inputData.classify) {
      throw new Error(
        `computeVerificationPath: classify missing for case ${inputData.caseId} run ${inputData.runId} — classifyCampaign must run first`,
      );
    }
    const verification_path = deriveVerificationPath(inputData);
    return {
      ...inputData,
      classify: { ...inputData.classify, verification_path },
    };
  },
});

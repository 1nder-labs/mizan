import { createStep } from "@mastra/core/workflows";
import {
  PartialBriefStateSchema,
  type PartialBriefState,
  type VerificationPath,
} from "../schemas/brief.ts";

/**
 * Minimum confidence each extractor must report to count as supplying
 * documentary evidence. Placeholder PNG fixtures (and adversarial
 * low-quality real uploads) will fall below this floor and route to the
 * `none` path so the forced-escalate gate fires on OFAC geographies.
 */
const DOCUMENTARY_MIN_CONFIDENCE = 60;

/**
 * Collapses extractor + vouching outputs into the canonical verification path.
 *
 * Decision order is vouching-explicit-wins, then confidence-gated documentary:
 *
 *   1. `structure ∈ { org-direct, individual-via-partner-org }`
 *      → `institutional_vouching` (the LLM has classified an org chain).
 *   2. `structure === individual-to-individual`
 *      → `community_vouching`.
 *   3. `structure === none` OR vouching not yet computed
 *      → require ALL three extractors AND each above
 *        `DOCUMENTARY_MIN_CONFIDENCE` to land on `documentary`; otherwise
 *        `none`. Extractor *presence* alone is not enough — placeholder
 *        PNGs would otherwise mask a high-risk no-evidence case.
 */
export function deriveVerificationPath(state: PartialBriefState): VerificationPath {
  const structure = state.signals?.vouching?.structure;
  if (structure === "org-direct" || structure === "individual-via-partner-org") {
    return "institutional_vouching";
  }
  if (structure === "individual-to-individual") {
    return "community_vouching";
  }
  return documentaryOrNone(state);
}

function documentaryOrNone(state: PartialBriefState): VerificationPath {
  const ext = state.extractions;
  if (!ext) return "none";
  const creator = ext.extractCreatorIdDoc;
  const bank = ext.extractBankStatement;
  const category = ext.extractCategoryDocs;
  if (!creator || !bank || !category) return "none";
  if (creator.confidence < DOCUMENTARY_MIN_CONFIDENCE) return "none";
  if (bank.confidence < DOCUMENTARY_MIN_CONFIDENCE) return "none";
  if (category.confidence < DOCUMENTARY_MIN_CONFIDENCE) return "none";
  return "documentary";
}

/**
 * Deterministic step that overwrites `classify.verification_path`.
 *
 * Throws when `classifyCampaign` has not run — leaving geography unknown
 * downstream would let `forcedEscalateGate` silently no-op on OFAC cases.
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

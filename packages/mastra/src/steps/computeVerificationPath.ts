import { createStep } from "@mastra/core/workflows";
import type { VerificationPath } from "@mizan/shared";
import { PartialBriefStateSchema, type PartialBriefState } from "../schemas/partial-brief-state.ts";
import type { CategoryDocsSchema } from "../schemas/extractions/category-docs.ts";
import type { BankStatementSchema } from "../schemas/extractions/bank-statement.ts";
import type { CreatorIdSchema } from "../schemas/extractions/creator-id.ts";
import type { z } from "zod";

/**
 * Minimum confidence each extractor must report to count as supplying
 * documentary evidence. Placeholder PNG fixtures (and adversarial
 * low-quality real uploads) fall below this floor and route to the
 * `none` path so the forced-escalate gate fires on OFAC geographies.
 *
 * Exported so test fixtures + canned-response builders pin to the same
 * threshold as the runtime predicate.
 */
export const DOCUMENTARY_MIN_CONFIDENCE = 60;

type CreatorId = z.infer<typeof CreatorIdSchema>;
type BankStatement = z.infer<typeof BankStatementSchema>;
type CategoryDocs = z.infer<typeof CategoryDocsSchema>;

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
 *        `DOCUMENTARY_MIN_CONFIDENCE` AND each looking like real evidence
 *        (non-empty critical fields). Extractor *presence* alone is not
 *        enough — a miscalibrated OCR returning high confidence on a
 *        blank placeholder PNG would otherwise mask a high-risk
 *        no-evidence case. Falls back to `none` if any check fails.
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
  if (
    !meetsConfidenceFloor(creator) ||
    !meetsConfidenceFloor(bank) ||
    !meetsConfidenceFloor(category)
  ) {
    return "none";
  }
  if (
    !looksLikeRealCreatorId(creator) ||
    !looksLikeRealBank(bank) ||
    !looksLikeRealCategory(category)
  ) {
    return "none";
  }
  return "documentary";
}

function meetsConfidenceFloor(extraction: { confidence: number }): boolean {
  return (
    Number.isFinite(extraction.confidence) && extraction.confidence >= DOCUMENTARY_MIN_CONFIDENCE
  );
}

function isNonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function looksLikeRealCreatorId(creator: CreatorId): boolean {
  return (
    isNonEmpty(creator.full_name) &&
    isNonEmpty(creator.document_number_redacted) &&
    isNonEmpty(creator.issuing_country_iso)
  );
}

function looksLikeRealBank(bank: BankStatement): boolean {
  return (
    isNonEmpty(bank.account_holder_name) &&
    isNonEmpty(bank.currency) &&
    isNonEmpty(bank.statement_period_iso)
  );
}

function looksLikeRealCategory(category: CategoryDocs): boolean {
  if (category.doc_kind === "medical") {
    return isNonEmpty(category.patient_name) && isNonEmpty(category.provider_name);
  }
  if (category.doc_kind === "school") {
    return isNonEmpty(category.student_name) && isNonEmpty(category.institution_name);
  }
  return (
    isNonEmpty(category.org_name) &&
    isNonEmpty(category.registration_number) &&
    isNonEmpty(category.jurisdiction)
  );
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
    /*
     * The workflow guarantees `signals.vouching` is populated by
     * `classifyVouchingChain` (via `mergeSignals`) before this step
     * runs. Treating a missing vouching slot as "fall through to
     * documentaryOrNone" would be silently fail-open if a refactor
     * skipped or reordered those upstream steps — we'd route to
     * `documentary` based on extractor evidence alone, exactly the
     * class of bug Review 2 caught. The pure `deriveVerificationPath`
     * predicate is intentionally permissive for unit-test callers; the
     * step is strict.
     */
    if (!inputData.signals?.vouching) {
      throw new Error(
        `computeVerificationPath: signals.vouching missing for case ${inputData.caseId} run ${inputData.runId} — classifyVouchingChain / mergeSignals must run first`,
      );
    }
    const verification_path = deriveVerificationPath(inputData);
    return {
      ...inputData,
      classify: { ...inputData.classify, verification_path },
    };
  },
});

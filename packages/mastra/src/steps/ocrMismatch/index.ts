import { createStep } from "@mastra/core/workflows";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getEnv } from "../../runtime/context-accessors.ts";
import { PartialBriefStateSchema } from "../../schemas/partial-brief-state.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import { composeOcrMismatch } from "./helpers.ts";

/**
 * Identity OCR-match signal. Deterministic + pure — it reuses the real fields
 * already extracted by the upstream vision steps (`extractCreatorIdDoc.full_name`
 * + `matches_organizer_name`, `extractBankStatement.account_holder_name`) and the
 * overlay `organizer_name`, so it spends no additional LLM call. Persists an
 * `ocr_mismatch` signal row and writes its slot into workflow state.
 *
 * Runs in the parallel signal branch after the extractors, so `extractions` is
 * populated; a missing creator-id extraction yields a `false` verdict (handled
 * in `composeOcrMismatch`) rather than throwing — an unverifiable identity is a
 * reviewer flag.
 */
export const ocrMismatch = createStep({
  id: "ocrMismatch",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    abortSignal?.throwIfAborted();
    const caseRow = await loadCaseContext(env, inputData.caseId);
    abortSignal?.throwIfAborted();
    const creatorId = inputData.extractions?.extractCreatorIdDoc;
    const bank = inputData.extractions?.extractBankStatement;
    const payload = composeOcrMismatch({
      organizerName: caseRow.organizer_name,
      idFullName: creatorId?.full_name,
      idMatchesOrganizer: creatorId?.matches_organizer_name,
      idMatchReason: creatorId?.organizer_name_match_reason,
      bankAccountHolder: bank?.account_holder_name,
      bankMatchesOrganizer: bank?.matches_organizer_name,
      bankMatchReason: bank?.organizer_name_match_reason,
    });
    await upsertSignal({
      env,
      caseId: inputData.caseId,
      runId: inputData.runId,
      signalType: "ocr_mismatch",
      payload,
    });
    return {
      ...inputData,
      signals: { ...inputData.signals, ocr: payload },
    };
  },
});

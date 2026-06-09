import type { OcrMismatchPayload } from "@mizan/shared";
import { nameSimilarity } from "../../util/name-similarity.ts";

/** Inputs the OCR-match signal needs, pulled from the upstream extractions + overlay. */
export interface OcrMismatchInput {
  readonly organizerName: string;
  readonly idFullName: string | undefined;
  readonly idMatchesOrganizer: boolean | undefined;
  readonly bankAccountHolder: string | undefined;
}

/**
 * Composes the OCR-match payload. The verdict (`name_matches_organizer`) is the
 * LLM's semantic judgment from the ID extraction; when the ID extraction is
 * absent (no creator-id doc, or the extractor degraded) the verdict is `false`
 * — an unverifiable identity is a reviewer flag, not a silent pass. The
 * similarities are computed for reviewer context only.
 */
export function composeOcrMismatch(input: OcrMismatchInput): OcrMismatchPayload {
  const idName = input.idFullName ?? "";
  const bankName = input.bankAccountHolder ?? null;
  const matches = input.idMatchesOrganizer ?? false;
  const idSimilarity = idName.length > 0 ? nameSimilarity(idName, input.organizerName) : 0;
  const bankSimilarity = bankName !== null ? nameSimilarity(bankName, input.organizerName) : null;
  return {
    claimed_organizer_name: input.organizerName,
    id_full_name: idName,
    bank_account_holder_name: bankName,
    name_matches_organizer: matches,
    id_organizer_similarity: idSimilarity,
    bank_organizer_similarity: bankSimilarity,
    summary: buildSummary(input.organizerName, idName, matches),
  };
}

/** One-line reviewer summary keyed off the verdict. */
function buildSummary(organizer: string, idName: string, matches: boolean): string {
  if (idName.length === 0) {
    return `No creator-ID name was extracted, so the identity of organizer "${organizer}" could not be verified.`;
  }
  return matches
    ? `ID name "${idName}" matches the claimed organizer "${organizer}".`
    : `ID name "${idName}" does NOT match the claimed organizer "${organizer}".`;
}

import type { OcrMismatchPayload } from "@mizan/shared";

/** Inputs the OCR-match signal needs, pulled from the upstream extractions + overlay. */
export interface OcrMismatchInput {
  readonly organizerName: string;
  readonly idFullName: string | undefined;
  readonly idMatchesOrganizer: boolean | undefined;
  readonly idMatchReason: string | undefined;
  readonly bankAccountHolder: string | undefined;
  readonly bankMatchesOrganizer: boolean | undefined;
  readonly bankMatchReason: string | undefined;
}

/**
 * Composes the OCR-match payload from the vision-LLM's semantic name-match
 * judgments (carried over from the ID + bank extractions). When the ID
 * extraction is absent (no creator-id doc, or the extractor degraded) the
 * verdict is `false` — an unverifiable identity is a reviewer flag, not a silent
 * pass. The bank fields are null when there is no bank extraction. No
 * character-distance score is computed; the model's identity judgment +
 * rationale is the signal.
 */
export function composeOcrMismatch(input: OcrMismatchInput): OcrMismatchPayload {
  const idName = input.idFullName ?? "";
  const bankName = input.bankAccountHolder ?? null;
  const matches = input.idMatchesOrganizer ?? false;
  return {
    claimed_organizer_name: input.organizerName,
    id_full_name: idName,
    bank_account_holder_name: bankName,
    name_matches_organizer: matches,
    id_match_reason: resolveIdReason(idName, matches, input.idMatchReason),
    bank_account_holder_matches: bankName !== null ? (input.bankMatchesOrganizer ?? false) : null,
    bank_match_reason: bankName !== null ? (input.bankMatchReason ?? null) : null,
    summary: buildSummary(input.organizerName, idName, matches),
  };
}

/** The LLM's reason when present; an honest fallback when the ID could not be read. */
function resolveIdReason(idName: string, matches: boolean, reason: string | undefined): string {
  if (idName.length === 0) return "No creator-ID name was extracted, so identity is unverified.";
  if (reason && reason.length > 0) return reason;
  return matches ? "The ID names the claimed organizer." : "The ID names a different person.";
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

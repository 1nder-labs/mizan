import { z } from "zod";
import type { GeographyTier, PolicyCitation, VerificationPath } from "@mizan/shared";
import type { PartialBriefState } from "../../schemas/partial-brief-state.ts";

export function buildClauseIdSchema(availableClauseIds: readonly string[]): z.ZodType<string> {
  const [first, second, ...rest] = availableClauseIds;
  if (first === undefined) return z.string();
  if (second === undefined) return z.literal(first);
  return z.union([z.literal(first), z.literal(second), ...rest.map((id) => z.literal(id))]);
}

/** Structured body the composeBrief LLM sees before the clause-list block is appended. */
export interface ComposeBriefBasePayload {
  caseId: string;
  category: string;
  geography: string;
  verification_path: VerificationPath | null;
  geography_tier: GeographyTier | null;
  extractions: NonNullable<PartialBriefState["extractions"]> | Record<string, never>;
  signals: NonNullable<PartialBriefState["signals"]> | Record<string, never>;
}

/** Final prompt body sent to the composeBrief LLM, including the clause-grounding block. */
export interface ComposeBriefPromptBody extends ComposeBriefBasePayload {
  policy_instruction: string;
  policy_matches: readonly PolicyCitation[];
  available_clause_ids: readonly string[];
  policy_clause_list: string;
}

/** Appends the cite-from-list instruction block to the composeBrief user payload. */
export function buildPromptWithClauses(
  basePayload: ComposeBriefBasePayload,
  policyMatches: readonly PolicyCitation[],
): ComposeBriefPromptBody {
  const clauseBlock = policyMatches
    .map((match) => `- ${match.clauseId} (${match.source}): ${match.excerpt}`)
    .join("\n");
  return {
    ...basePayload,
    policy_instruction:
      "Cite at least 2 and at most 8 policy clauses using ONLY clauseIds from policy_matches.",
    policy_matches: policyMatches,
    available_clause_ids: policyMatches.map((match) => match.clauseId),
    policy_clause_list: clauseBlock,
  };
}

/** Strips citations whose clauseId was not present in matchPolicy output. */
export function applyCitationFilter<
  T extends { readonly policy_citations: readonly PolicyCitation[] },
>(object: T, allowedClauseIds: ReadonlySet<string>): T {
  return {
    ...object,
    policy_citations: object.policy_citations.filter((citation) =>
      allowedClauseIds.has(citation.clauseId),
    ),
  };
}

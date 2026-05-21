import { z } from "zod";
import type { PolicyCitation } from "../../schemas/brief.ts";

/** Builds a per-call clauseId schema for composeBrief structured output. */
export function buildClauseIdSchema(availableClauseIds: readonly string[]): z.ZodType<string> {
  if (availableClauseIds.length === 0) return z.string();
  const literals = availableClauseIds.map((clauseId) => z.literal(clauseId));
  if (literals.length === 1) {
    const only = literals[0];
    if (!only) return z.string();
    return only;
  }
  const [first, second, ...rest] = literals;
  if (!first || !second) return z.string();
  return z.union([first, second, ...rest]);
}

/** Appends the cite-from-list instruction block to the composeBrief user payload. */
export function buildPromptWithClauses(
  basePayload: Record<string, unknown>,
  policyMatches: readonly PolicyCitation[],
): Record<string, unknown> {
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

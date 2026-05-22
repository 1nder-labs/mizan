import type { BriefPayload } from "../../schemas/brief.ts";

/** Builds compose-tier prompt inputs for the drafted organizer message step. */
export function buildDraftPrompt(input: { brief: BriefPayload }): {
  system: string;
  userPayload: Record<string, unknown>;
} {
  const { brief } = input;
  return {
    system:
      "You are LaunchGood's trust & safety reviewer drafting a polite missing-evidence ask. Reference cited policy clauses by clauseId. Output JSON matching the schema.",
    userPayload: {
      recommendation: brief.recommendation,
      missing_docs: brief.missing_docs,
      policy_citations: brief.policy_citations,
    },
  };
}

import { describe, expect, it } from "bun:test";
import type { BriefPayload } from "@mizan/mastra";
import { buildDraftPrompt } from "@mizan/mastra/testing";

const sampleBrief: BriefPayload = {
  recommendation: "REQUEST_DOCS",
  verification_path: "none",
  geography_tier: "AT_RISK",
  missing_docs: [{ docType: "bank_statement", reason: "Incomplete period" }],
  reviewer_questions: [],
  extracted_claims: "Documents partially extracted; bank statement missing.",
  confidence: 50,
  policy_citations: [
    {
      clauseId: "safety.4.1",
      source: "safety",
      excerpt: "Organizer identity verification required.",
      relevance: 0.9,
    },
  ],
};

describe("buildDraftPrompt", () => {
  it("returns system string and user payload with brief fields", () => {
    const { system, userPayload } = buildDraftPrompt({ brief: sampleBrief });
    expect(system.length).toBeGreaterThan(0);
    expect(userPayload.recommendation).toBe("REQUEST_DOCS");
    expect(userPayload.missing_docs).toEqual(sampleBrief.missing_docs);
    expect(userPayload.policy_citations).toEqual(sampleBrief.policy_citations);
  });

  it("includes only the recommendation, missing_docs, and policy_citations on the user payload", () => {
    const { userPayload } = buildDraftPrompt({ brief: sampleBrief });
    expect(Object.keys(userPayload).sort()).toEqual([
      "missing_docs",
      "policy_citations",
      "recommendation",
    ]);
  });

  it("handles empty missing_docs and policy_citations", () => {
    const brief: BriefPayload = {
      ...sampleBrief,
      missing_docs: [],
      policy_citations: [],
    };
    const { userPayload } = buildDraftPrompt({ brief });
    expect(userPayload.missing_docs).toEqual([]);
    expect(userPayload.policy_citations).toEqual([]);
  });
});

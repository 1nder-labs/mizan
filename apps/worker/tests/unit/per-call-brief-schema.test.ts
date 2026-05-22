import { describe, expect, it } from "bun:test";
import { buildPerCallBriefSchema } from "@mizan/mastra/steps/composeBrief/run.ts";

const validPayload = {
  recommendation: "READY_FOR_REVIEW" as const,
  missing_docs: [],
  reviewer_questions: [],
  extracted_claims: {},
  confidence: 75,
};

describe("buildPerCallBriefSchema", () => {
  it("accepts citations whose clauseId is in the available set", () => {
    const schema = buildPerCallBriefSchema(["zakat.5.1", "zakat.7.2"]);
    const parsed = schema.parse({
      ...validPayload,
      policy_citations: [
        { clauseId: "zakat.5.1", source: "zakat", excerpt: "Medical", relevance: 0.9 },
      ],
    });
    expect(parsed.policy_citations).toHaveLength(1);
  });

  it("rejects citations whose clauseId is not in the available set", () => {
    const schema = buildPerCallBriefSchema(["zakat.5.1"]);
    expect(() =>
      schema.parse({
        ...validPayload,
        policy_citations: [
          { clauseId: "hallucinated.99", source: "zakat", excerpt: "", relevance: 0.5 },
        ],
      }),
    ).toThrow();
  });

  it("falls back to bare string clauseId schema when no matches available", () => {
    const schema = buildPerCallBriefSchema([]);
    const parsed = schema.parse({
      ...validPayload,
      policy_citations: [{ clauseId: "anything", source: "zakat", excerpt: "", relevance: 0.1 }],
    });
    expect(parsed.policy_citations[0]?.clauseId).toBe("anything");
  });

  it("requires policy_citations on LLM output (no default — LLM must emit array)", () => {
    const schema = buildPerCallBriefSchema(["zakat.5.1"]);
    expect(() => schema.parse(validPayload)).toThrow();
  });
});

import { describe, expect, it } from "bun:test";
import {
  applyCitationFilter,
  buildClauseIdSchema,
  buildPromptWithClauses,
} from "@mizan/mastra/steps/composeBrief/helpers.ts";

describe("composeBrief helpers", () => {
  it("buildClauseIdSchema accepts listed ids and rejects hallucinations", () => {
    const schema = buildClauseIdSchema(["zakat.3.1", "zakat.3.2"]);
    expect(schema.parse("zakat.3.1")).toBe("zakat.3.1");
    expect(() => schema.parse("hallucinated.99")).toThrow();
  });

  it("buildClauseIdSchema falls back to string when no ids are available", () => {
    const schema = buildClauseIdSchema([]);
    expect(schema.parse("anything")).toBe("anything");
  });

  it("applyCitationFilter keeps only allowed clauseIds", () => {
    const filtered = applyCitationFilter(
      {
        policy_citations: [
          { clauseId: "zakat.3.1", source: "zakat", excerpt: "a", relevance: 1 },
          { clauseId: "hallucinated.99", source: "zakat", excerpt: "b", relevance: 1 },
        ],
      },
      new Set(["zakat.3.1"]),
    );
    expect(filtered.policy_citations).toHaveLength(1);
    expect(filtered.policy_citations[0]?.clauseId).toBe("zakat.3.1");
  });

  it("buildPromptWithClauses embeds available clause ids", () => {
    const payload = buildPromptWithClauses({ caseId: "case-1" }, [
      { clauseId: "zakat.5.1", source: "zakat", excerpt: "Medical", relevance: 0.9 },
    ]);
    expect(payload["available_clause_ids"]).toEqual(["zakat.5.1"]);
    expect(String(payload["policy_clause_list"])).toContain("zakat.5.1");
  });
});

describe("buildClauseIdSchema union edge", () => {
  it("supports a single available clause id", () => {
    const schema = buildClauseIdSchema(["zakat.1"]);
    expect(schema.parse("zakat.1")).toBe("zakat.1");
  });
});

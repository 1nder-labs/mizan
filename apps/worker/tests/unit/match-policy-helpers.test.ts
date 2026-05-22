import { describe, expect, it } from "bun:test";
import {
  buildPolicyQuery,
  parseMatchToCitation,
  resolveExcerptMap,
  resolvePolicySource,
} from "@mizan/mastra/steps/matchPolicy/helpers.ts";
import { loadPolicyCorpora } from "@mizan/mastra/corpus/load.ts";

describe("matchPolicy helpers", () => {
  it("buildPolicyQuery joins non-empty fields", () => {
    const query = buildPolicyQuery(
      {
        id: "case-1",
        status: "DRAFT",
        category: "medical",
        geography: "US",
        claimed_zakat_category: "medical",
        brief_partial_json: {},
        current_run_id: null,
        created_by: "user",
        created_at: new Date(),
        updated_at: new Date(),
        story: "Urgent surgery",
        organizer_name: "Organizer",
        r2_keys: { creator_id: "a", bank_statement: "b", category_doc: "c" },
      },
      {
        caseId: "case-1",
        runId: "run-1",
        extractions: {
          extractStoryClaims: {
            claims: [
              {
                claim: "Hospital payment",
                supporting_text_snippet: "Hospital",
                plausibility_score: 90,
              },
            ],
            confidence: 80,
          },
        },
      },
    );
    expect(query).toContain("Urgent surgery");
    expect(query).toContain("Hospital payment");
  });

  it("resolvePolicySource maps empty categories to safety", () => {
    expect(resolvePolicySource("")).toBe("safety");
    expect(resolvePolicySource("medical")).toBe("zakat");
  });

  it("parseMatchToCitation rejects missing clause ids", () => {
    const excerptMap = resolveExcerptMap(loadPolicyCorpora());
    const citation = parseMatchToCitation(
      { id: "x", score: 0.5, metadata: { source: "zakat" } },
      excerptMap,
    );
    expect(citation).toBeNull();
  });

  it("resolveExcerptMap covers all committed clauses", () => {
    const map = resolveExcerptMap(loadPolicyCorpora());
    expect(map.size).toBeGreaterThan(30);
    expect(map.has("zakat.5.1")).toBe(true);
    expect(map.has("safety.2.1")).toBe(true);
  });
});

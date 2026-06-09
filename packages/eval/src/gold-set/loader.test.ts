import { describe, expect, it } from "vitest";
import { GoldCaseSchema } from "./schema.ts";
import { loadGoldSet } from "./loader.ts";

describe("loadGoldSet", () => {
  it("returns a non-empty array where each element satisfies GoldCaseSchema", () => {
    const cases = loadGoldSet();
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(GoldCaseSchema.parse(c)).toEqual(c);
    }
  });

  it("every SAFE caseSeedId matches a known documentary seed id", () => {
    const SAFE_IDS = new Set([
      "11111111-1111-4111-8111-111111111101",
      "11111111-1111-4111-8111-111111111102",
      "11111111-1111-4111-8111-111111111103",
      "11111111-1111-4111-8111-111111111104",
      "11111111-1111-4111-8111-111111111105",
    ]);
    const cases = loadGoldSet();
    for (const c of cases) {
      if (c.expected_geography_tier === "SAFE") {
        expect(SAFE_IDS.has(c.caseSeedId)).toBe(true);
      }
    }
  });

  it("rejects a fixture missing both recommendation fields", () => {
    const bad = {
      caseSeedId: "x",
      label: "bad",
      expected_geography_tier: "SAFE",
      expect_policy_grounded: true,
    };
    expect(() => GoldCaseSchema.parse(bad)).toThrow();
  });

  it("rejects a fixture setting both recommendation fields", () => {
    const bad = {
      caseSeedId: "x",
      label: "bad",
      expected_geography_tier: "SAFE",
      expect_policy_grounded: true,
      expected_recommendation: "ESCALATE",
      expected_recommendation_in: ["BLOCK"],
    };
    expect(() => GoldCaseSchema.parse(bad)).toThrow();
  });

  it("rejects an invalid enum value", () => {
    const bad = {
      caseSeedId: "x",
      label: "bad",
      expected_geography_tier: "INVALID_TIER",
      expect_policy_grounded: true,
      expected_recommendation: "ESCALATE",
    };
    expect(() => GoldCaseSchema.parse(bad)).toThrow();
  });
});

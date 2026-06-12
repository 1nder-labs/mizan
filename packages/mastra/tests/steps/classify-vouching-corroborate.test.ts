import { describe, expect, test } from "bun:test";
import { corroborateOrDegrade } from "../../src/steps/classifyVouchingChain/corroborate.ts";

/**
 * Regression: the corroboration guards correctly REJECT an accountability
 * structure the vouching narrative does not support, but that rejection must
 * degrade to `none` — NOT throw and brick the brief. The bug (caught dogfooding
 * a "money goes directly to the school" campaign whose narrative only named "the
 * local committee") was that the throw propagated out of the step and failed the
 * whole workflow, leaving the case stuck RUNNING.
 */
describe("corroborateOrDegrade", () => {
  test("degrades org-direct to none when the partner org is not in the vouching narrative", () => {
    const result = corroborateOrDegrade(
      { structure: "org-direct", partner_org_name: "the school", weakest_link_narrative: "x" },
      {
        story: "Money goes directly to the school.",
        vouching_narrative: "Vouched by the local committee.",
      },
    );
    expect(result.structure).toBe("none");
    expect(result.weakest_link_narrative).toContain("could not be corroborated");
  });

  test("degrades when the vouching narrative is too short to corroborate a partner org", () => {
    const result = corroborateOrDegrade(
      {
        structure: "individual-via-partner-org",
        partner_org_name: "Sudan Aid Foundation",
        weakest_link_narrative: "x",
      },
      { story: "story", vouching_narrative: "short" },
    );
    expect(result.structure).toBe("none");
  });

  test("passes a corroborated org-direct chain through unchanged", () => {
    const chain = {
      structure: "org-direct" as const,
      partner_org_name: "Sudan Aid Foundation",
      weakest_link_narrative: "Routed via Sudan Aid Foundation.",
    };
    const result = corroborateOrDegrade(chain, {
      story: "irrelevant",
      vouching_narrative:
        "The campaign is vouched for and administered by the Sudan Aid Foundation, a registered relief org.",
    });
    expect(result).toEqual(chain);
  });

  test("passes a none chain through untouched (no corroboration owed)", () => {
    const chain = { structure: "none" as const, weakest_link_narrative: "No supporters named." };
    expect(corroborateOrDegrade(chain, { story: "s", vouching_narrative: null })).toEqual(chain);
  });

  test("never throws for any structure/narrative combination", () => {
    const cases = [
      { structure: "org-direct" as const, partner_org_name: "", weakest_link_narrative: "x" },
      {
        structure: "individual-via-partner-org" as const,
        partner_org_name: "  ",
        weakest_link_narrative: "x",
      },
      { structure: "individual-to-individual" as const, weakest_link_narrative: "x" },
    ];
    for (const chain of cases) {
      expect(() =>
        corroborateOrDegrade(chain, { story: "s", vouching_narrative: null }),
      ).not.toThrow();
    }
  });
});

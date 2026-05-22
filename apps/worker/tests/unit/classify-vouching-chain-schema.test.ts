import { describe, expect, it } from "bun:test";
import { VouchingChainSchema } from "@mizan/mastra";

describe("VouchingChainSchema", () => {
  it("parses none variant", () => {
    const parsed = VouchingChainSchema.parse({
      structure: "none",
      weakest_link_narrative: "no chain available",
    });
    expect(parsed.structure).toBe("none");
  });

  it("parses partner-org variant with partner_org_name", () => {
    const parsed = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "Sudan Aid Foundation",
      weakest_link_narrative: "via partner",
    });
    expect(parsed.structure).toBe("individual-via-partner-org");
    if (parsed.structure === "individual-via-partner-org") {
      expect(parsed.partner_org_name).toBe("Sudan Aid Foundation");
    }
  });

  it("rejects partner variant without partner_org_name", () => {
    expect(() =>
      VouchingChainSchema.parse({
        structure: "individual-via-partner-org",
        weakest_link_narrative: "missing partner",
      }),
    ).toThrow();
  });

  it("rejects unknown structure discriminator", () => {
    expect(() =>
      VouchingChainSchema.parse({
        structure: "unknown-variant",
        weakest_link_narrative: "x",
      }),
    ).toThrow();
  });
});

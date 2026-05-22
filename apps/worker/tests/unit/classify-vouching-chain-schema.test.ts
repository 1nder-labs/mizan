import { describe, expect, it } from "bun:test";
import {
  VouchingChainSchema,
  assertPartnerOrgCorroborated,
  assertVouchingChain,
} from "@mizan/mastra";

describe("VouchingChainSchema", () => {
  it("parses none variant", () => {
    const parsed = VouchingChainSchema.parse({
      structure: "none",
      weakest_link_narrative: "no chain available",
    });
    expect(parsed.structure).toBe("none");
  });

  it("parses individual-to-individual variant", () => {
    const parsed = VouchingChainSchema.parse({
      structure: "individual-to-individual",
      weakest_link_narrative: "neighbor-to-neighbor chain",
    });
    expect(parsed.structure).toBe("individual-to-individual");
  });

  it("parses individual-via-partner-org variant with partner_org_name", () => {
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

  it("parses org-direct variant with partner_org_name", () => {
    const parsed = VouchingChainSchema.parse({
      structure: "org-direct",
      partner_org_name: "Direct Relief",
      weakest_link_narrative: "org owns disbursement",
    });
    expect(parsed.structure).toBe("org-direct");
    if (parsed.structure === "org-direct") {
      expect(parsed.partner_org_name).toBe("Direct Relief");
    }
  });

  it("rejects individual-via-partner-org without partner_org_name", () => {
    expect(() =>
      VouchingChainSchema.parse({
        structure: "individual-via-partner-org",
        weakest_link_narrative: "missing partner",
      }),
    ).toThrow();
  });

  it("rejects org-direct without partner_org_name", () => {
    expect(() =>
      VouchingChainSchema.parse({
        structure: "org-direct",
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

describe("assertVouchingChain", () => {
  it("returns the chain unchanged when structure is none", () => {
    const chain = VouchingChainSchema.parse({
      structure: "none",
      weakest_link_narrative: "no chain",
    });
    expect(assertVouchingChain(chain)).toEqual(chain);
  });

  it("returns the chain unchanged when partner_org_name is non-empty", () => {
    const chain = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "Sudan Aid Foundation",
      weakest_link_narrative: "via partner",
    });
    expect(assertVouchingChain(chain)).toEqual(chain);
  });

  it("throws on individual-via-partner-org with empty partner_org_name", () => {
    const chain = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "",
      weakest_link_narrative: "empty name",
    });
    expect(() => assertVouchingChain(chain)).toThrow();
  });

  it("throws on org-direct with empty partner_org_name", () => {
    const chain = VouchingChainSchema.parse({
      structure: "org-direct",
      partner_org_name: "   ",
      weakest_link_narrative: "whitespace name",
    });
    expect(() => assertVouchingChain(chain)).toThrow();
  });
});

describe("assertPartnerOrgCorroborated", () => {
  it("passes through chains with no partner_org_name (none / i2i)", () => {
    const noneChain = VouchingChainSchema.parse({
      structure: "none",
      weakest_link_narrative: "no chain",
    });
    expect(
      assertPartnerOrgCorroborated(noneChain, { story: "anything", vouching_narrative: null }),
    ).toEqual(noneChain);
  });

  it("accepts a partner name corroborated by the story", () => {
    const chain = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "Sudan Aid Foundation",
      weakest_link_narrative: "via partner",
    });
    const ok = assertPartnerOrgCorroborated(chain, {
      story: "We work through Sudan Aid Foundation.",
      vouching_narrative: null,
    });
    expect(ok).toEqual(chain);
  });

  it("accepts a partner name corroborated only by vouching_narrative", () => {
    const chain = VouchingChainSchema.parse({
      structure: "org-direct",
      partner_org_name: "Direct Relief",
      weakest_link_narrative: "direct",
    });
    expect(
      assertPartnerOrgCorroborated(chain, {
        story: "unrelated story",
        vouching_narrative: "Direct Relief handles disbursement.",
      }),
    ).toEqual(chain);
  });

  it("is case-insensitive", () => {
    const chain = VouchingChainSchema.parse({
      structure: "org-direct",
      partner_org_name: "ICRC",
      weakest_link_narrative: "direct",
    });
    expect(
      assertPartnerOrgCorroborated(chain, {
        story: "Funds go through icrc.",
        vouching_narrative: null,
      }),
    ).toEqual(chain);
  });

  it("throws when the partner is not mentioned anywhere — guards against LLM hallucination", () => {
    const chain = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "Fabricated Charity Inc",
      weakest_link_narrative: "via partner",
    });
    expect(() =>
      assertPartnerOrgCorroborated(chain, {
        story: "Our family needs emergency relief in Sanaa.",
        vouching_narrative: "Neighbors vouch for us.",
      }),
    ).toThrow(/not corroborated/);
  });
});

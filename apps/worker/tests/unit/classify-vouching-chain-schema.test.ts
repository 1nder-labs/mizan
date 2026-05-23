import { describe, expect, it } from "bun:test";
import {
  VouchingChainSchema,
  assertCommunityVouchingCorroborated,
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

  it("rejects an institutional structure when vouching_narrative is null — story-only mention insufficient", () => {
    const chain = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "Sudan Aid Foundation",
      weakest_link_narrative: "via partner",
    });
    expect(() =>
      assertPartnerOrgCorroborated(chain, {
        story: "We work through Sudan Aid Foundation.",
        vouching_narrative: null,
      }),
    ).toThrow(/requires a vouching_narrative/);
  });

  it("rejects an institutional structure when vouching_narrative is too short", () => {
    const chain = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "Sudan Aid Foundation",
      weakest_link_narrative: "via partner",
    });
    expect(() =>
      assertPartnerOrgCorroborated(chain, {
        story: "We work through Sudan Aid Foundation.",
        vouching_narrative: "Sudan Aid",
      }),
    ).toThrow(/requires a vouching_narrative/);
  });

  it("accepts when partner_org_name appears in a sufficiently long vouching_narrative", () => {
    const chain = VouchingChainSchema.parse({
      structure: "org-direct",
      partner_org_name: "Direct Relief",
      weakest_link_narrative: "direct",
    });
    expect(
      assertPartnerOrgCorroborated(chain, {
        story: "unrelated story",
        vouching_narrative: "Direct Relief handles every disbursement to the field site.",
      }),
    ).toEqual(chain);
  });

  it("is case-insensitive when matching the narrative", () => {
    const chain = VouchingChainSchema.parse({
      structure: "org-direct",
      partner_org_name: "ICRC",
      weakest_link_narrative: "direct",
    });
    expect(
      assertPartnerOrgCorroborated(chain, {
        story: "general background",
        vouching_narrative:
          "Funds flow through icrc, the registered Red Cross partner organization handling oversight.",
      }),
    ).toEqual(chain);
  });

  it("throws when partner is mentioned only in the story (not in vouching_narrative)", () => {
    const chain = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "Red Cross",
      weakest_link_narrative: "via partner",
    });
    expect(() =>
      assertPartnerOrgCorroborated(chain, {
        story: "Red Cross helped us during the flood. Family needs further relief.",
        vouching_narrative:
          "Neighbours and community elders attest to the household needs and identity.",
      }),
    ).toThrow(/is not mentioned in vouching_narrative/);
  });

  it("throws when partner is fully fabricated — not in story or narrative", () => {
    const chain = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "Fabricated Charity Inc",
      weakest_link_narrative: "via partner",
    });
    expect(() =>
      assertPartnerOrgCorroborated(chain, {
        story: "Our family needs emergency relief in Sanaa.",
        vouching_narrative:
          "Neighbours and community elders attest to the household needs and identity.",
      }),
    ).toThrow(/is not mentioned in vouching_narrative/);
  });

  it("rejects short partner names that cannot disambiguate", () => {
    const chain = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "Ai",
      weakest_link_narrative: "via partner",
    });
    expect(() =>
      assertPartnerOrgCorroborated(chain, {
        story: "Ai works with our family.",
        vouching_narrative:
          "Ai handles disbursement on our behalf. The partnership has run for two years.",
      }),
    ).toThrow(/too short to corroborate/);
  });

  it("rejects a partner name that only appears inside an unrelated word (word-boundary check)", () => {
    const chain = VouchingChainSchema.parse({
      structure: "individual-via-partner-org",
      partner_org_name: "Aid",
      weakest_link_narrative: "via partner",
    });
    expect(() =>
      assertPartnerOrgCorroborated(chain, {
        story: "She was treated at the local AIDS clinic in Nairobi.",
        vouching_narrative:
          "She was treated at the local AIDS clinic in Nairobi which oversees disbursement.",
      }),
    ).toThrow(/too short to corroborate/);
  });

  it("accepts a multi-word partner name when both tokens appear contiguously in the narrative", () => {
    const chain = VouchingChainSchema.parse({
      structure: "org-direct",
      partner_org_name: "Sudan Aid Foundation",
      weakest_link_narrative: "via partner",
    });
    expect(
      assertPartnerOrgCorroborated(chain, {
        story: "General background.",
        vouching_narrative: "Sudan Aid Foundation handles disbursement and construction oversight.",
      }),
    ).toEqual(chain);
  });
});

describe("assertCommunityVouchingCorroborated", () => {
  const i2i = VouchingChainSchema.parse({
    structure: "individual-to-individual",
    weakest_link_narrative: "neighbour chain",
  });

  it("returns the chain unchanged when the source has a substantial vouching_narrative", () => {
    expect(
      assertCommunityVouchingCorroborated(i2i, {
        vouching_narrative:
          "Verified by three community elders who know the family personally for over a decade.",
      }),
    ).toEqual(i2i);
  });

  it("throws when vouching_narrative is null — Gaza-style misclassification guard", () => {
    expect(() => assertCommunityVouchingCorroborated(i2i, { vouching_narrative: null })).toThrow(
      /community-vouching path requires/,
    );
  });

  it("throws when vouching_narrative is too short", () => {
    expect(() => assertCommunityVouchingCorroborated(i2i, { vouching_narrative: "ok" })).toThrow(
      /community-vouching path requires/,
    );
  });

  it("passes structure=none through unchanged regardless of source", () => {
    const none = VouchingChainSchema.parse({
      structure: "none",
      weakest_link_narrative: "no chain",
    });
    expect(assertCommunityVouchingCorroborated(none, { vouching_narrative: null })).toEqual(none);
  });

  it("passes partner structures through unchanged", () => {
    const orgDirect = VouchingChainSchema.parse({
      structure: "org-direct",
      partner_org_name: "Direct Relief",
      weakest_link_narrative: "x",
    });
    expect(assertCommunityVouchingCorroborated(orgDirect, { vouching_narrative: null })).toEqual(
      orgDirect,
    );
  });
});

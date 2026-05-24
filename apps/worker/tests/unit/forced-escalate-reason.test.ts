import { describe, expect, it } from "bun:test";
import { forcedEscalateReason } from "@mizan/mastra/testing";

/**
 * Reviewer-facing one-liner. Each path renders a distinct explanation
 * sourced from the in-module lookup table; drift between
 * `forceEscalate`'s decision and this message would misdirect reviewer
 * remediation, so the tests below pin the path-specific phrase for
 * every verification_path the gate can fire on.
 */
describe("forcedEscalateReason", () => {
  it("names the no-chain branch for verification_path=none", () => {
    const reason = forcedEscalateReason({
      verification_path: "none",
      geography_tier: "OFAC_ADJACENT",
      geography: "PS",
    });
    expect(reason).toContain("verification_path=none");
    expect(reason).toContain("geography_tier=OFAC_ADJACENT");
    expect(reason).toContain("PS");
    expect(reason).toContain("no documentary verification path; trust = vouching strength");
    expect(reason).toContain("no vouching chain available");
  });

  it("names the community-vouching branch for verification_path=community_vouching", () => {
    const reason = forcedEscalateReason({
      verification_path: "community_vouching",
      geography_tier: "OFAC_ADJACENT",
      geography: "YE",
    });
    expect(reason).toContain("verification_path=community_vouching");
    expect(reason).toContain("geography_tier=OFAC_ADJACENT");
    expect(reason).toContain("YE");
    expect(reason).toContain("community vouching insufficient");
  });

  it("names the institutional-vouching branch for verification_path=institutional_vouching", () => {
    const reason = forcedEscalateReason({
      verification_path: "institutional_vouching",
      geography_tier: "OFAC",
      geography: "SD",
    });
    expect(reason).toContain("verification_path=institutional_vouching");
    expect(reason).toContain("geography_tier=OFAC");
    expect(reason).toContain("SD");
    expect(reason).toContain("institutional vouching insufficient");
  });

  it("names the documentary-OFAC branch for verification_path=documentary + OFAC", () => {
    const reason = forcedEscalateReason({
      verification_path: "documentary",
      geography_tier: "OFAC",
      geography: "SY",
    });
    expect(reason).toContain("verification_path=documentary");
    expect(reason).toContain("geography_tier=OFAC");
    expect(reason).toContain("SY");
    expect(reason).toContain("manual OFAC SDN check");
  });
});

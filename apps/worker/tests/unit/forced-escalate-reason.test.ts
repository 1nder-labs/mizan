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
  it("explains the no-evidence branch in plain language and names the location/tier", () => {
    const reason = forcedEscalateReason({
      verification_path: "none",
      geography_tier: "OFAC_ADJACENT",
      geography: "PS",
    });
    expect(reason).not.toContain("verification_path=");
    expect(reason).not.toContain("geography_tier=");
    expect(reason).toContain("no verification evidence");
    expect(reason).toContain("PS");
    expect(reason).toContain("an OFAC-adjacent jurisdiction");
  });

  it("explains the community-vouching branch in plain language", () => {
    const reason = forcedEscalateReason({
      verification_path: "community_vouching",
      geography_tier: "OFAC_ADJACENT",
      geography: "YE",
    });
    expect(reason).not.toContain("verification_path=");
    expect(reason).toContain("community vouching");
    expect(reason).toContain("YE");
    expect(reason).toContain("an OFAC-adjacent jurisdiction");
  });

  it("explains the institutional-vouching branch in plain language", () => {
    const reason = forcedEscalateReason({
      verification_path: "institutional_vouching",
      geography_tier: "OFAC",
      geography: "SD",
    });
    expect(reason).not.toContain("verification_path=");
    expect(reason).toContain("institutional vouch");
    expect(reason).toContain("SD");
    expect(reason).toContain("an OFAC-sanctioned jurisdiction");
  });

  it("explains the documentary-OFAC branch in plain language", () => {
    const reason = forcedEscalateReason({
      verification_path: "documentary",
      geography_tier: "OFAC",
      geography: "SY",
    });
    expect(reason).not.toContain("geography_tier=");
    expect(reason).toContain("sanctions-list (SDN) check");
    expect(reason).toContain("SY");
    expect(reason).toContain("an OFAC-sanctioned jurisdiction");
  });
});

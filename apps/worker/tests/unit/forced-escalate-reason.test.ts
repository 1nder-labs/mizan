import { describe, expect, it } from "bun:test";
import { forcedEscalateReason } from "@mizan/mastra/testing";

/**
 * `forcedEscalateReason` is the human-readable explanation rendered on
 * the brief when the gate fires. Asserting on its exact text-content
 * pins the reviewer surface: the predicate branch that triggered the
 * override is named in the reason so a reviewer can audit the override
 * without re-running the predicate. Drift here (e.g., "no documentary
 * chain" attached to the community_vouching branch) would misdirect
 * reviewer remediation.
 */
describe("forcedEscalateReason", () => {
  it("names the no-documentary-chain branch for verification_path=none", () => {
    const reason = forcedEscalateReason({
      verification_path: "none",
      geography_tier: "OFAC",
      geography: "SD",
    });
    expect(reason).toContain("verification_path=none");
    expect(reason).toContain("geography_tier=OFAC");
    expect(reason).toContain("SD");
    expect(reason).toContain("no documentary chain");
    expect(reason).not.toContain("community vouching insufficient");
  });

  it("names the community-vouching branch for verification_path=community_vouching + OFAC", () => {
    const reason = forcedEscalateReason({
      verification_path: "community_vouching",
      geography_tier: "OFAC",
      geography: "SY",
    });
    expect(reason).toContain("verification_path=community_vouching");
    expect(reason).toContain("geography_tier=OFAC");
    expect(reason).toContain("SY");
    expect(reason).toContain("community vouching insufficient");
    expect(reason).not.toContain("no documentary chain");
  });

  it("falls through to the no-documentary-chain branch for the AT_RISK + none combination", () => {
    const reason = forcedEscalateReason({
      verification_path: "none",
      geography_tier: "AT_RISK",
      geography: "ML",
    });
    expect(reason).toContain("verification_path=none");
    expect(reason).toContain("AT_RISK");
    expect(reason).toContain("ML");
    expect(reason).toContain("no documentary chain");
  });

  it("names the institutional-vouching branch for verification_path=institutional_vouching + OFAC", () => {
    const reason = forcedEscalateReason({
      verification_path: "institutional_vouching",
      geography_tier: "OFAC",
      geography: "SD",
    });
    expect(reason).toContain("verification_path=institutional_vouching");
    expect(reason).toContain("geography_tier=OFAC");
    expect(reason).toContain("SD");
    expect(reason).toContain("institutional vouching insufficient");
    expect(reason).toContain("OFAC SDN check");
    expect(reason).not.toContain("no documentary chain");
  });
});

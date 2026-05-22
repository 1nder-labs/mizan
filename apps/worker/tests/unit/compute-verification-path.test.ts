import { describe, expect, it } from "bun:test";
import { deriveVerificationPath } from "@mizan/mastra";
import type { PartialBriefState } from "@mizan/mastra";

function baseState(overrides: Partial<PartialBriefState> = {}): PartialBriefState {
  return {
    caseId: "case-id",
    runId: "run-id",
    ...overrides,
  };
}

describe("deriveVerificationPath", () => {
  it("returns documentary when all three extractors present", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: {
            document_type: "passport",
            full_name: "A",
            document_number_redacted: "****",
            issuing_country_iso: "US",
            issue_date_iso: "2020-01-01",
            expiry_date_iso: "2030-01-01",
            matches_organizer_name: true,
            confidence: 80,
          },
          extractBankStatement: {
            account_holder_name: "A",
            currency: "USD",
            statement_period_iso: "2026-01",
            latest_balance_redacted: "****",
            suspicious_activity_detected: false,
            confidence: 80,
          },
          extractCategoryDocs: {
            doc_kind: "medical",
            patient_name: "A",
            provider_name: "B",
            treatment_summary: "C",
            amount_claimed: "1 USD",
            confidence: 80,
          },
        },
        signals: {
          vouching: {
            structure: "org-direct",
            partner_org_name: "Org",
            weakest_link_narrative: "x",
          },
        },
      }),
    );
    expect(path).toBe("documentary");
  });

  it("returns institutional_vouching for partner-org structure", () => {
    const path = deriveVerificationPath(
      baseState({
        signals: {
          vouching: {
            structure: "individual-via-partner-org",
            partner_org_name: "Sudan Aid Foundation",
            weakest_link_narrative: "via partner",
          },
        },
      }),
    );
    expect(path).toBe("institutional_vouching");
  });

  it("returns institutional_vouching for org-direct structure", () => {
    const path = deriveVerificationPath(
      baseState({
        signals: {
          vouching: {
            structure: "org-direct",
            partner_org_name: "Org",
            weakest_link_narrative: "direct",
          },
        },
      }),
    );
    expect(path).toBe("institutional_vouching");
  });

  it("returns community_vouching for individual-to-individual", () => {
    const path = deriveVerificationPath(
      baseState({
        signals: {
          vouching: {
            structure: "individual-to-individual",
            weakest_link_narrative: "peer chain",
          },
        },
      }),
    );
    expect(path).toBe("community_vouching");
  });

  it("returns none when vouching is none and extractors missing", () => {
    const path = deriveVerificationPath(
      baseState({
        signals: { vouching: { structure: "none", weakest_link_narrative: "none" } },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns none with partial extractors only", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: {
            document_type: "passport",
            full_name: "A",
            document_number_redacted: "****",
            issuing_country_iso: "US",
            issue_date_iso: "2020-01-01",
            expiry_date_iso: "2030-01-01",
            matches_organizer_name: true,
            confidence: 80,
          },
          extractBankStatement: {
            account_holder_name: "A",
            currency: "USD",
            statement_period_iso: "2026-01",
            latest_balance_redacted: "****",
            suspicious_activity_detected: false,
            confidence: 80,
          },
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns none with empty state", () => {
    expect(deriveVerificationPath(baseState())).toBe("none");
  });
});

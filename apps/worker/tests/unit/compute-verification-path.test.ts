import { describe, expect, it } from "bun:test";
import { deriveVerificationPath } from "@mizan/mastra";
import type { PartialBriefState } from "@mizan/mastra/testing";

function baseState(overrides: Partial<PartialBriefState> = {}): PartialBriefState {
  return {
    caseId: "case-id",
    runId: "run-id",
    ...overrides,
  };
}

const HIGH_CREATOR = {
  document_type: "passport" as const,
  full_name: "A",
  document_number_redacted: "****",
  issuing_country_iso: "US",
  issue_date_iso: "2020-01-01",
  expiry_date_iso: "2030-01-01",
  matches_organizer_name: true,
  confidence: 88,
};

const HIGH_BANK = {
  account_holder_name: "A",
  currency: "USD",
  statement_period_iso: "2026-01",
  latest_balance_redacted: "****",
  suspicious_activity_detected: false,
  confidence: 82,
};

const HIGH_CATEGORY = {
  doc_kind: "medical" as const,
  patient_name: "A",
  provider_name: "B",
  treatment_summary: "C",
  amount_claimed: "1 USD",
  confidence: 75,
};

const LOW_CREATOR = { ...HIGH_CREATOR, confidence: 15 };
const LOW_BANK = { ...HIGH_BANK, confidence: 20 };
const LOW_CATEGORY = { ...HIGH_CATEGORY, confidence: 10 };

describe("deriveVerificationPath", () => {
  it("returns documentary when all three extractors are present AND above the confidence floor", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: HIGH_CATEGORY,
        },
      }),
    );
    expect(path).toBe("documentary");
  });

  it("returns institutional_vouching when vouching=org-direct even with high-confidence extractors", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: HIGH_CATEGORY,
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
    expect(path).toBe("institutional_vouching");
  });

  it("returns institutional_vouching for individual-via-partner-org variant", () => {
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

  it("returns none when vouching=none even when ALL three extractor keys are present at low confidence (P0 case-008 regression guard)", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: LOW_CREATOR,
          extractBankStatement: LOW_BANK,
          extractCategoryDocs: LOW_CATEGORY,
        },
        signals: {
          vouching: { structure: "none", weakest_link_narrative: "no chain" },
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns none when extractor confidence is below floor (single extractor under threshold)", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: { ...HIGH_BANK, confidence: 55 },
          extractCategoryDocs: HIGH_CATEGORY,
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns none when vouching is none and extractors missing entirely", () => {
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
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns none with empty state", () => {
    expect(deriveVerificationPath(baseState())).toBe("none");
  });

  it("vouching takes precedence over high-confidence extractor stack", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: HIGH_CATEGORY,
        },
        signals: {
          vouching: { structure: "individual-to-individual", weakest_link_narrative: "peers" },
        },
      }),
    );
    expect(path).toBe("community_vouching");
  });

  it("returns none when extractor confidence is high but critical fields are blank (real-evidence guard)", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: { ...HIGH_CREATOR, full_name: "" },
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: HIGH_CATEGORY,
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns none when medical category doc is high-confidence but patient_name is blank", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: { ...HIGH_CATEGORY, patient_name: "" },
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns none when medical category doc is high-confidence but provider_name is blank", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: { ...HIGH_CATEGORY, provider_name: "" },
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns documentary when vouching.structure='none' and all three extractors meet the real-evidence floor (Mode-A documentary path regression guard)", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: HIGH_CATEGORY,
        },
        signals: {
          vouching: { structure: "none", weakest_link_narrative: "no chain" },
        },
      }),
    );
    expect(path).toBe("documentary");
  });

  it("returns documentary when every extractor sits exactly at the DOCUMENTARY_MIN_CONFIDENCE floor (60)", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: { ...HIGH_CREATOR, confidence: 60 },
          extractBankStatement: { ...HIGH_BANK, confidence: 60 },
          extractCategoryDocs: { ...HIGH_CATEGORY, confidence: 60 },
        },
      }),
    );
    expect(path).toBe("documentary");
  });

  it("returns none when one extractor is exactly one below the DOCUMENTARY_MIN_CONFIDENCE floor (59)", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: { ...HIGH_BANK, confidence: 59 },
          extractCategoryDocs: HIGH_CATEGORY,
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns documentary at maximum confidence (100)", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: { ...HIGH_CREATOR, confidence: 100 },
          extractBankStatement: { ...HIGH_BANK, confidence: 100 },
          extractCategoryDocs: { ...HIGH_CATEGORY, confidence: 100 },
        },
      }),
    );
    expect(path).toBe("documentary");
  });

  it("returns none when bank statement is high-confidence but currency is empty", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: { ...HIGH_BANK, currency: "" },
          extractCategoryDocs: HIGH_CATEGORY,
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns none when school category doc is high-confidence but student_name is blank", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: {
            doc_kind: "school",
            student_name: "",
            institution_name: "Some Madrasa",
            tuition_summary: "Term 1 tuition",
            amount_claimed: "500 USD",
            confidence: 82,
          },
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns none when school category doc is high-confidence but institution_name is blank", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: {
            doc_kind: "school",
            student_name: "Aisha Khan",
            institution_name: "",
            tuition_summary: "Term 1 tuition",
            amount_claimed: "500 USD",
            confidence: 82,
          },
        },
      }),
    );
    expect(path).toBe("none");
  });

  it("returns documentary for school doc with all critical fields populated above confidence floor", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: {
            doc_kind: "school",
            student_name: "Aisha Khan",
            institution_name: "Some Madrasa",
            tuition_summary: "Term 1 tuition",
            amount_claimed: "500 USD",
            confidence: 82,
          },
        },
      }),
    );
    expect(path).toBe("documentary");
  });

  it("returns none when org-registration category doc is high-confidence but org_name is blank", () => {
    const path = deriveVerificationPath(
      baseState({
        extractions: {
          extractCreatorIdDoc: HIGH_CREATOR,
          extractBankStatement: HIGH_BANK,
          extractCategoryDocs: {
            doc_kind: "org_registration",
            org_name: "",
            registration_number: "123",
            jurisdiction: "US",
            tax_exempt_status: null,
            confidence: 80,
          },
        },
      }),
    );
    expect(path).toBe("none");
  });
});

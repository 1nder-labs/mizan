/**
 * Builds canned MOCK_LLM_RESPONSES maps for integration tests and eval fixtures.
 */

import type { BriefPayload } from "../../schemas/brief.ts";

const BASE_CREATOR = {
  document_type: "passport" as const,
  full_name: "Mizan Demo",
  document_number_redacted: "****1234",
  issuing_country_iso: "US",
  issue_date_iso: "2020-01-01",
  expiry_date_iso: "2030-01-01",
  matches_organizer_name: true,
  confidence: 85,
};

const BASE_BANK = {
  account_holder_name: "Mizan Demo",
  currency: "USD",
  statement_period_iso: "2026-01/2026-03",
  latest_balance_redacted: "****500",
  suspicious_activity_detected: false,
  confidence: 80,
};

function briefPayload(
  recommendation: BriefPayload["recommendation"],
  confidence: number,
): BriefPayload {
  return {
    recommendation,
    missing_docs: [],
    reviewer_questions: [],
    extracted_claims: { summary: "Documentary evidence reviewed" },
    confidence,
  };
}

/** Canned extractor + compose responses for case-001 (medical/US, complete). */
export function case001Responses(): Record<string, unknown> {
  return {
    "extractCreatorIdDoc.extract": { ...BASE_CREATOR, full_name: "Mizan Demo Patient" },
    "extractBankStatement.extract": { ...BASE_BANK, account_holder_name: "Mizan Demo Patient" },
    "extractCategoryDocs.extract": {
      doc_kind: "medical",
      patient_name: "Mizan Demo Patient",
      provider_name: "Mizan Test Hospital",
      treatment_summary: "Urgent surgery",
      amount_claimed: "15000 USD",
      confidence: 88,
    },
    "extractStoryClaims.extract": {
      claims: [
        {
          claim: "Funds go directly to hospital",
          supporting_text_snippet: "All funds go directly to the hospital",
          plausibility_score: 90,
        },
      ],
      confidence: 85,
    },
    "composeBrief.compose": briefPayload("READY_FOR_REVIEW", 82),
  };
}

/** Canned responses for case-002 (school/UK, complete). */
export function case002Responses(): Record<string, unknown> {
  return {
    "extractCreatorIdDoc.extract": {
      ...BASE_CREATOR,
      full_name: "Mizan Demo Student",
      issuing_country_iso: "GB",
    },
    "extractBankStatement.extract": {
      ...BASE_BANK,
      account_holder_name: "Mizan Demo Student",
      currency: "GBP",
    },
    "extractCategoryDocs.extract": {
      doc_kind: "school",
      student_name: "Mizan Demo Student",
      institution_name: "Mizan Test Academy",
      tuition_summary: "Term fees due",
      amount_claimed: "5000 GBP",
      confidence: 86,
    },
    "extractStoryClaims.extract": {
      claims: [
        {
          claim: "Tuition support for current term",
          supporting_text_snippet: "Fees are due this term",
          plausibility_score: 88,
        },
      ],
      confidence: 84,
    },
    "composeBrief.compose": briefPayload("READY_FOR_REVIEW", 80),
  };
}

/** Canned responses for case-003 (org-registration/PK, missing tax exempt). */
export function case003Responses(): Record<string, unknown> {
  return {
    "extractCreatorIdDoc.extract": {
      ...BASE_CREATOR,
      full_name: "Mizan Demo Org",
      issuing_country_iso: "PK",
    },
    "extractBankStatement.extract": {
      ...BASE_BANK,
      account_holder_name: "Mizan Demo Org",
      currency: "PKR",
    },
    "extractCategoryDocs.extract": {
      doc_kind: "org_registration",
      org_name: "Mizan Demo Org",
      registration_number: "PK-REG-001",
      jurisdiction: "PK",
      tax_exempt_status: null,
      confidence: 70,
    },
    "extractStoryClaims.extract": {
      claims: [
        {
          claim: "501(c)(3) equivalent pending",
          supporting_text_snippet: "501(c)(3) equivalent pending",
          plausibility_score: 60,
        },
      ],
      confidence: 65,
    },
    "composeBrief.compose": {
      ...briefPayload("REQUEST_DOCS", 55),
      missing_docs: [
        { docType: "tax_exempt_certificate", reason: "501(c)(3) equivalent not provided" },
      ],
    },
  };
}

/** Canned responses for case-004 (medical/ID, incomplete bank). */
export function case004Responses(): Record<string, unknown> {
  return {
    "extractCreatorIdDoc.extract": {
      ...BASE_CREATOR,
      full_name: "Mizan Demo Caregiver",
      issuing_country_iso: "ID",
    },
    "extractBankStatement.extract": {
      account_holder_name: "Mizan Demo Caregiver",
      currency: "IDR",
      statement_period_iso: "2026-02",
      latest_balance_redacted: "****",
      suspicious_activity_detected: false,
      confidence: 40,
    },
    "extractCategoryDocs.extract": {
      doc_kind: "medical",
      patient_name: "Mizan Demo Caregiver",
      provider_name: "Mizan Jakarta Clinic",
      treatment_summary: "Emergency transport",
      amount_claimed: "8000000 IDR",
      confidence: 75,
    },
    "extractStoryClaims.extract": {
      claims: [
        {
          claim: "Emergency medical transport needed",
          supporting_text_snippet: "Emergency medical transport",
          plausibility_score: 78,
        },
      ],
      confidence: 72,
    },
    "composeBrief.compose": {
      ...briefPayload("REQUEST_DOCS", 48),
      missing_docs: [{ docType: "bank_statement", reason: "Statement period incomplete" }],
    },
  };
}

/** Canned responses for case-005 (school/EG, story mismatch). */
export function case005Responses(): Record<string, unknown> {
  return {
    "extractCreatorIdDoc.extract": {
      ...BASE_CREATOR,
      full_name: "Mizan Demo Guardian",
      issuing_country_iso: "EG",
    },
    "extractBankStatement.extract": {
      ...BASE_BANK,
      account_holder_name: "Mizan Demo Guardian",
      currency: "EGP",
    },
    "extractCategoryDocs.extract": {
      doc_kind: "school",
      student_name: "Mizan Demo Student",
      institution_name: "Mizan Primary School Cairo",
      tuition_summary: "Primary enrollment fees",
      amount_claimed: "20000 EGP",
      confidence: 80,
    },
    "extractStoryClaims.extract": {
      claims: [
        {
          claim: "University fees in Cairo",
          supporting_text_snippet: "university fees in Cairo",
          plausibility_score: 35,
        },
      ],
      confidence: 40,
    },
    "composeBrief.compose": briefPayload("ESCALATE", 45),
  };
}

/** Serializes a canned map for `env.MOCK_LLM_RESPONSES`. */
export function serializeMockResponses(map: Record<string, unknown>): string {
  return JSON.stringify(map);
}

/** All five seed case ids in documentary order. */
export const SEED_CASE_IDS = [
  "11111111-1111-4111-8111-111111111101",
  "11111111-1111-4111-8111-111111111102",
  "11111111-1111-4111-8111-111111111103",
  "11111111-1111-4111-8111-111111111104",
  "11111111-1111-4111-8111-111111111105",
] as const;

/** Returns the canned map builder for a seed case index (0–4). */
export function responsesForCaseIndex(index: number): Record<string, unknown> {
  switch (index) {
    case 0:
      return case001Responses();
    case 1:
      return case002Responses();
    case 2:
      return case003Responses();
    case 3:
      return case004Responses();
    case 4:
      return case005Responses();
    default:
      throw new Error(`unknown seed case index ${String(index)}`);
  }
}

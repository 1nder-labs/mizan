import {
  BASE_AUTHENTICITY,
  BASE_BANK,
  BASE_CREATOR,
  DEFAULT_SAFETY_CITATIONS,
  DEFAULT_ZAKAT_CITATIONS,
  briefPayload,
  documentaryStorySignal,
  noVouchingChain,
  requestDocsCompose,
} from "./shared.ts";

/** Canned extractor + compose responses for case-001 (medical/US, complete). */
export function case001Responses(): Record<string, unknown> {
  return {
    "extractCreatorIdDoc.extract": { ...BASE_CREATOR, full_name: "Mizan Demo Patient" },
    "extractBankStatement.extract": { ...BASE_BANK, account_holder_name: "Mizan Demo Patient" },
    "extractCategoryDocs.extract": {
      image_authenticity: BASE_AUTHENTICITY,
      doc: {
        doc_kind: "medical",
        patient_name: "Mizan Demo Patient",
        provider_name: "Mizan Test Hospital",
        treatment_summary: "Urgent surgery",
        amount_claimed: "15000 USD",
        confidence: 88,
      },
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
    "storyCoherence.evaluate": documentaryStorySignal(
      "Specific hospital and patient details with consistent narrative.",
      0.81,
    ),
    "classifyVouchingChain.classify": noVouchingChain(
      "Documentary evidence chain is primary; no parallel vouching path claimed.",
    ),
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
      image_authenticity: BASE_AUTHENTICITY,
      doc: {
        doc_kind: "school",
        student_name: "Mizan Demo Student",
        institution_name: "Mizan Test Academy",
        tuition_summary: "Term fees due",
        amount_claimed: "5000 GBP",
        confidence: 86,
      },
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
    "storyCoherence.evaluate": documentaryStorySignal(
      "School fees narrative aligns with uploaded tuition documents.",
      0.79,
    ),
    "classifyVouchingChain.classify": noVouchingChain("Standard documentary school campaign."),
    "composeBrief.compose": briefPayload("READY_FOR_REVIEW", 80, DEFAULT_ZAKAT_CITATIONS),
  };
}

/** Canned responses for case-003 (org-registration/PK, missing tax exempt). */
function case003ExtractorBlock(): Record<string, unknown> {
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
      image_authenticity: BASE_AUTHENTICITY,
      doc: {
        doc_kind: "org_registration",
        org_name: "Mizan Demo Org",
        registration_number: "PK-REG-001",
        jurisdiction: "PK",
        tax_exempt_status: null,
        confidence: 70,
      },
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
  };
}

export function case003Responses(): Record<string, unknown> {
  return {
    ...case003ExtractorBlock(),
    "storyCoherence.evaluate": documentaryStorySignal(
      "Org registration story is coherent but tax-exempt status is unresolved.",
      0.62,
    ),
    "classifyVouchingChain.classify": {
      chain: {
        structure: "org-direct" as const,
        partner_org_name: "Mizan Demo Org",
        weakest_link_narrative: "Registered org with pending tax documentation.",
      },
    },
    ...requestDocsCompose(
      55,
      { docType: "tax_exempt_certificate", reason: "501(c)(3) equivalent not provided" },
      DEFAULT_SAFETY_CITATIONS,
      {
        message:
          "Please upload your 501(c)(3) equivalent or tax-exempt certificate so we can verify nonprofit status.",
        missing_items: ["tax_exempt_certificate"],
      },
    ),
  };
}

/** Canned responses for case-004 (medical/ID, incomplete bank). */
function case004ExtractorBlock(): Record<string, unknown> {
  return {
    "extractCreatorIdDoc.extract": {
      ...BASE_CREATOR,
      full_name: "Mizan Demo Caregiver",
      issuing_country_iso: "ID",
    },
    "extractBankStatement.extract": {
      account_holder_name: "Mizan Demo Caregiver",
      matches_organizer_name: true,
      organizer_name_match_reason: "Account holder is the organizer.",
      currency: "IDR",
      statement_period_iso: "2026-02",
      latest_balance_redacted: "****",
      suspicious_activity_detected: false,
      confidence: 40,
    },
    "extractCategoryDocs.extract": {
      image_authenticity: BASE_AUTHENTICITY,
      doc: {
        doc_kind: "medical",
        patient_name: "Mizan Demo Caregiver",
        provider_name: "Mizan Jakarta Clinic",
        treatment_summary: "Emergency transport",
        amount_claimed: "8000000 IDR",
        confidence: 75,
      },
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
  };
}

export function case004Responses(): Record<string, unknown> {
  return {
    ...case004ExtractorBlock(),
    "storyCoherence.evaluate": documentaryStorySignal(
      "Emergency narrative is specific though bank evidence is incomplete.",
      0.7,
    ),
    "classifyVouchingChain.classify": noVouchingChain(
      "Medical emergency with incomplete bank documentation.",
    ),
    ...requestDocsCompose(
      48,
      { docType: "bank_statement", reason: "Statement period incomplete" },
      DEFAULT_ZAKAT_CITATIONS,
      {
        message:
          "Please provide a complete bank statement covering the full statement period requested.",
        missing_items: ["bank_statement"],
      },
    ),
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
      image_authenticity: BASE_AUTHENTICITY,
      doc: {
        doc_kind: "school",
        student_name: "Mizan Demo Student",
        institution_name: "Mizan Primary School Cairo",
        tuition_summary: "Primary enrollment fees",
        amount_claimed: "20000 EGP",
        confidence: 80,
      },
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
    "storyCoherence.evaluate": documentaryStorySignal(
      "Story claims university fees but category documents show primary school.",
      0.38,
    ),
    "classifyVouchingChain.classify": noVouchingChain(
      "Story mismatch reduces trust in narrative claims.",
    ),
    "composeBrief.compose": briefPayload("ESCALATE", 45, DEFAULT_SAFETY_CITATIONS),
  };
}

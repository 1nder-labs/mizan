import { DEFAULT_SAFETY_CITATIONS, briefPayload } from "./shared.ts";

/*
 * Community-vouching cases (006-008) place placeholder PNG bytes at every
 * R2 key so the workflow can exercise its extractor steps end-to-end.
 * The extractors' canned responses below intentionally report low
 * confidence to reflect what real OCR / vision models would return on
 * those placeholders — `deriveVerificationPath` then routes via the
 * vouching signal, not the (low-confidence) extractor stack.
 *
 * Threshold reminder: `computeVerificationPath.DOCUMENTARY_MIN_CONFIDENCE`
 * is currently 60; the values below sit well under that floor.
 */

const PLACEHOLDER_CREATOR_LOW_CONFIDENCE = {
  document_type: "other" as const,
  full_name: "",
  document_number_redacted: "",
  issuing_country_iso: "",
  issue_date_iso: null,
  expiry_date_iso: null,
  matches_organizer_name: false,
  confidence: 12,
};

const PLACEHOLDER_BANK_LOW_CONFIDENCE = {
  account_holder_name: "",
  currency: "",
  statement_period_iso: "",
  latest_balance_redacted: "",
  suspicious_activity_detected: false,
  confidence: 15,
};

function placeholderCategoryLowConfidence(): Record<string, unknown> {
  return {
    doc_kind: "org_registration",
    org_name: "",
    registration_number: "",
    jurisdiction: "",
    tax_exempt_status: null,
    confidence: 10,
  };
}

const PLACEHOLDER_STORY_CLAIMS = {
  claims: [],
  confidence: 20,
};

/** Canned responses for case-006 (Yemen community vouching). */
export function case006Responses(): Record<string, unknown> {
  return {
    "extractCreatorIdDoc.extract": PLACEHOLDER_CREATOR_LOW_CONFIDENCE,
    "extractBankStatement.extract": PLACEHOLDER_BANK_LOW_CONFIDENCE,
    "extractCategoryDocs.extract": placeholderCategoryLowConfidence(),
    "extractStoryClaims.extract": {
      claims: [
        {
          claim: "Community elders vouch for household",
          supporting_text_snippet: "community leaders vouch",
          plausibility_score: 72,
        },
      ],
      confidence: 70,
    },
    "storyCoherence.evaluate": {
      named_entity_density: 0.58,
      template_match_score: 0.65,
      coherence_summary: "Community vouching narrative is internally consistent.",
    },
    "classifyVouchingChain.classify": {
      structure: "individual-to-individual" as const,
      weakest_link_narrative: "Funds move through neighbor network without institutional partner.",
    },
    "composeBrief.compose": {
      ...briefPayload("REQUEST_DOCS", 58, DEFAULT_SAFETY_CITATIONS),
      missing_docs: [
        { docType: "creator_id", reason: "No government ID available in current conditions" },
      ],
    },
    "draftOrganizerMessage.draft": {
      message:
        "Please provide any available government-issued ID or community reference letter per safety.4.1.",
      missing_items: ["creator_id"],
    },
  };
}

/** Canned responses for case-007 (Sudan institutional vouching). */
export function case007Responses(): Record<string, unknown> {
  return {
    "extractCreatorIdDoc.extract": PLACEHOLDER_CREATOR_LOW_CONFIDENCE,
    "extractBankStatement.extract": PLACEHOLDER_BANK_LOW_CONFIDENCE,
    "extractCategoryDocs.extract": placeholderCategoryLowConfidence(),
    "extractStoryClaims.extract": PLACEHOLDER_STORY_CLAIMS,
    "storyCoherence.evaluate": {
      named_entity_density: 0.64,
      template_match_score: 0.74,
      coherence_summary: "Partner-org masjid rebuild narrative is coherent.",
    },
    "classifyVouchingChain.classify": {
      structure: "individual-via-partner-org" as const,
      partner_org_name: "Sudan Aid Foundation",
      weakest_link_narrative: "Organizer routes funds through named partner organization.",
    },
    "composeBrief.compose": briefPayload("READY_FOR_REVIEW", 76, DEFAULT_SAFETY_CITATIONS),
  };
}

/** Canned responses for case-008 (Gaza none path → forced escalate). */
export function case008Responses(): Record<string, unknown> {
  return {
    "extractCreatorIdDoc.extract": PLACEHOLDER_CREATOR_LOW_CONFIDENCE,
    "extractBankStatement.extract": PLACEHOLDER_BANK_LOW_CONFIDENCE,
    "extractCategoryDocs.extract": placeholderCategoryLowConfidence(),
    "extractStoryClaims.extract": PLACEHOLDER_STORY_CLAIMS,
    "storyCoherence.evaluate": {
      named_entity_density: 0.25,
      template_match_score: 0.3,
      coherence_summary: "Sparse narrative with no verifiable accountability chain.",
    },
    "classifyVouchingChain.classify": {
      structure: "none" as const,
      weakest_link_narrative: "No documentary or vouching chain documented.",
    },
    "composeBrief.compose": briefPayload("READY_FOR_REVIEW", 42, DEFAULT_SAFETY_CITATIONS),
  };
}

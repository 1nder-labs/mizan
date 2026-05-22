import { DEFAULT_SAFETY_CITATIONS, briefPayload } from "./shared.ts";

/** Canned responses for case-006 (Yemen community vouching). */
export function case006Responses(): Record<string, unknown> {
  return {
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
    "extractStoryClaims.extract": {
      claims: [
        {
          claim: "Partner org manages disbursement",
          supporting_text_snippet: "Sudan Aid Foundation manages disbursement",
          plausibility_score: 80,
        },
      ],
      confidence: 78,
    },
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
    "extractStoryClaims.extract": {
      claims: [
        {
          claim: "Emergency individual appeal",
          supporting_text_snippet: "Individual emergency appeal",
          plausibility_score: 45,
        },
      ],
      confidence: 40,
    },
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

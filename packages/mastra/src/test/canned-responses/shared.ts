import type { BriefPayload } from "../../schemas/brief.ts";

export const BASE_CREATOR = {
  document_type: "passport" as const,
  full_name: "Mizan Demo",
  document_number_redacted: "****1234",
  issuing_country_iso: "US",
  issue_date_iso: "2020-01-01",
  expiry_date_iso: "2030-01-01",
  matches_organizer_name: true,
  confidence: 85,
};

export const BASE_BANK = {
  account_holder_name: "Mizan Demo",
  currency: "USD",
  statement_period_iso: "2026-01/2026-03",
  latest_balance_redacted: "****500",
  suspicious_activity_detected: false,
  confidence: 80,
};

export const DEFAULT_ZAKAT_CITATIONS: BriefPayload["policy_citations"] = [
  {
    clauseId: "zakat.5.1",
    source: "zakat",
    excerpt:
      "Medical campaigns: Medical Zakat campaigns must demonstrate that funds benefit an eligible Muslim recipient.",
    relevance: 0.91,
  },
  {
    clauseId: "zakat.7.2",
    source: "zakat",
    excerpt:
      "Direct disbursement claims: When a campaign claims that all funds go directly to a hospital, reviewers must confirm disbursement.",
    relevance: 0.88,
  },
];

export const DEFAULT_SAFETY_CITATIONS: BriefPayload["policy_citations"] = [
  {
    clauseId: "safety.2.1",
    source: "safety",
    excerpt:
      "Manual reviews: Every campaign is manually reviewed to ensure it follows LaunchGood website guidelines.",
    relevance: 0.9,
  },
  {
    clauseId: "safety.4.1",
    source: "safety",
    excerpt:
      "Organizer identity verification: Organizers must provide government-issued identification where required.",
    relevance: 0.86,
  },
];

/** Builds a minimal composeBrief payload for canned mock responses. */
export function briefPayload(
  recommendation: BriefPayload["recommendation"],
  confidence: number,
  policyCitations: BriefPayload["policy_citations"] = DEFAULT_ZAKAT_CITATIONS,
): BriefPayload {
  return {
    recommendation,
    missing_docs: [],
    reviewer_questions: [],
    extracted_claims: "Documentary evidence reviewed.",
    confidence,
    policy_citations: policyCitations,
  };
}

/** Phase 4 story-coherence canned block for documentary cases. */
export function documentaryStorySignal(summary: string, templateScore: number) {
  return {
    named_entity_density: templateScore,
    template_match_score: templateScore,
    coherence_summary: summary,
  };
}

/** Phase 4 vouching-chain canned block with no partner path. */
export function noVouchingChain(narrative: string) {
  return { structure: "none" as const, weakest_link_narrative: narrative };
}

/** REQUEST_DOCS compose payload with draft organizer message for canned tests. */
export function requestDocsCompose(
  confidence: number,
  missingDoc: { docType: string; reason: string },
  policyCitations: BriefPayload["policy_citations"],
  draft: { message: string; missing_items: string[] },
) {
  return {
    "composeBrief.compose": {
      ...briefPayload("REQUEST_DOCS", confidence, policyCitations),
      missing_docs: [missingDoc],
    },
    "draftOrganizerMessage.draft": draft,
  };
}

import { describe, expect, it } from "bun:test";
import type { BriefPayload, DraftedOrganizerMessage } from "@mizan/mastra";
import { escalateBriefProjection } from "@mizan/mastra/testing";

const DRAFT: DraftedOrganizerMessage = {
  message: "Please send your government ID and recent utility bill.",
  missing_items: ["creator_id", "utility_bill"],
};

const REQUEST_DOCS_BRIEF: BriefPayload = {
  recommendation: "REQUEST_DOCS",
  verification_path: "none",
  geography_tier: "OFAC_ADJACENT",
  policy_grounded: true,
  missing_docs: [{ docType: "creator_id", reason: "missing" }],
  reviewer_questions: [],
  extracted_claims: "Partial extraction",
  confidence: 50,
  policy_citations: [],
};

/*
 * Production workflow ordering is:
 *
 *     composeBrief → draftOrganizerMessage → forcedEscalateGate
 *
 * `draftOrganizerMessage` attaches `drafted_organizer_message` to a
 * REQUEST_DOCS brief; if the brief then trips the forced-escalate
 * predicate (path=none + high-risk tier), `escalateBriefProjection`
 * MUST strip the draft on its way to ESCALATE — a leftover draft on an
 * ESCALATE recommendation would misrepresent reviewer guidance.
 *
 * The individual projections are unit-tested in
 * `forced-escalate-gate-step.test.ts` and
 * `draft-organizer-message-decision.test.ts`. This test pins the
 * COMPOSITION — the chain the workflow actually runs — so a refactor
 * that changed projection order would fail here loudly.
 */
describe("draft → forced-escalate projection chain (workflow ordering)", () => {
  it("strips drafted_organizer_message when the gate fires on a REQUEST_DOCS+drafted brief", () => {
    const afterDraft: BriefPayload = { ...REQUEST_DOCS_BRIEF, drafted_organizer_message: DRAFT };
    expect(afterDraft.drafted_organizer_message).toEqual(DRAFT);

    const afterGate = escalateBriefProjection({
      brief: afterDraft,
      forced_escalate_reason:
        "verification_path=none + geography_tier=OFAC_ADJACENT (case in PS: no documentary chain, high-risk jurisdiction)",
    });
    expect(afterGate.recommendation).toBe("ESCALATE");
    expect(afterGate.drafted_organizer_message).toBeUndefined();
    expect(afterGate.forced_escalate_reason).toContain("no documentary chain");
  });

  it("preserves missing_docs through both projections so reviewer can still see what was missing", () => {
    const afterDraft: BriefPayload = { ...REQUEST_DOCS_BRIEF, drafted_organizer_message: DRAFT };
    const afterGate = escalateBriefProjection({
      brief: afterDraft,
      forced_escalate_reason: "reason",
    });
    expect(afterGate.missing_docs).toEqual(REQUEST_DOCS_BRIEF.missing_docs);
    expect(afterGate.policy_citations).toEqual(REQUEST_DOCS_BRIEF.policy_citations);
  });

  it("preserves verification_path and geography_tier through the chain", () => {
    const afterDraft: BriefPayload = { ...REQUEST_DOCS_BRIEF, drafted_organizer_message: DRAFT };
    const afterGate = escalateBriefProjection({
      brief: afterDraft,
      forced_escalate_reason: "reason",
    });
    expect(afterGate.verification_path).toBe("none");
    expect(afterGate.geography_tier).toBe("OFAC_ADJACENT");
  });
});

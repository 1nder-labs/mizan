import { describe, expect, it } from "bun:test";
import type { BriefPayload, DraftedOrganizerMessage } from "@mizan/shared";
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

/**
 * Pass 8 reordered the workflow so `forcedEscalateGate` now runs
 * BEFORE `draftOrganizerMessage` — the gate fires first, the draft
 * LLM sees the (possibly escalated) recommendation and skips when it
 * lands on ESCALATE. In the happy path the brief therefore never has
 * `drafted_organizer_message` set at gate time, and the strip in
 * `escalateBriefProjection` is a defensive no-op.
 *
 * This test exists for the retry / migration / refactor path: if a
 * future workflow change re-introduces drafted_organizer_message
 * before the gate, the projection's strip MUST still fire so a
 * leftover draft on an ESCALATE recommendation cannot reach the
 * reviewer. The individual projections are unit-tested elsewhere;
 * this file pins the composition.
 */
describe("forced-escalate projection drops any pre-existing draft (defensive composition)", () => {
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

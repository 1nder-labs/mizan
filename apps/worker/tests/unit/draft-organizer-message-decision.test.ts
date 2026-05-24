import { describe, expect, it } from "bun:test";
import type { BriefPayload } from "@mizan/shared";
import type { PartialBriefState } from "@mizan/mastra/testing";
import { decideDraftAction } from "@mizan/mastra/testing";

function brief(recommendation: BriefPayload["recommendation"]): BriefPayload {
  return {
    recommendation,
    verification_path: "documentary",
    geography_tier: "SAFE",
    policy_grounded: true,
    missing_docs: [],
    reviewer_questions: [],
    extracted_claims: "",
    confidence: 50,
    policy_citations: [],
  };
}

function state(b: BriefPayload | undefined): PartialBriefState {
  return {
    caseId: "case-id",
    runId: "run-id",
    ...(b ? { brief: b } : {}),
  };
}

describe("decideDraftAction", () => {
  it("returns draft + narrowed brief for REQUEST_DOCS", () => {
    const decision = decideDraftAction(state(brief("REQUEST_DOCS")));
    expect(decision.kind).toBe("draft");
    if (decision.kind === "draft") {
      expect(decision.brief.recommendation).toBe("REQUEST_DOCS");
    }
  });

  it("skips for READY_FOR_REVIEW", () => {
    expect(decideDraftAction(state(brief("READY_FOR_REVIEW"))).kind).toBe("skip");
  });

  it("skips for ESCALATE", () => {
    expect(decideDraftAction(state(brief("ESCALATE"))).kind).toBe("skip");
  });

  it("skips for BLOCK", () => {
    expect(decideDraftAction(state(brief("BLOCK"))).kind).toBe("skip");
  });

  it("throws when brief is missing — upstream failure should not be swallowed", () => {
    expect(() => decideDraftAction(state(undefined))).toThrow(/brief missing/);
  });

  it("error message includes case_id and run_id for triage", () => {
    expect(() => decideDraftAction({ caseId: "case-trace-1", runId: "run-trace-1" })).toThrow(
      /case-trace-1/,
    );
  });
});

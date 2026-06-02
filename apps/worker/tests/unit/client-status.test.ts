import { describe, expect, it } from "bun:test";
import {
  CaseStatusEnum,
  ClientStatusEnum,
  ReviewerActionEnum,
  toClientStatus,
} from "@mizan/shared";

/**
 * `toClientStatus` is the total internal-status × latest-action → ClientStatus
 * map (U7). These assertions encode the authoritative table from the plan
 * directly (literal expected values, not a re-implementation), plus a totality
 * sweep proving every (status × action) pair resolves to a valid ClientStatus.
 */
describe("toClientStatus", () => {
  it("maps the documented table rows", () => {
    expect(toClientStatus("DRAFT", null)).toBe("submitted");
    expect(toClientStatus("QUEUED", null)).toBe("submitted");
    expect(toClientStatus("RUNNING", null)).toBe("under_review");
    expect(toClientStatus("SUSPENDED_HITL", null)).toBe("under_review");
    expect(toClientStatus("READY_FOR_REVIEW", null)).toBe("under_review");
    expect(toClientStatus("RUNNING", "REQUEST_DOCS")).toBe("needs_evidence");
    expect(toClientStatus("READY_FOR_REVIEW", "REQUEST_DOCS")).toBe("needs_evidence");
    expect(toClientStatus("ACTIONED", "APPROVE")).toBe("approved");
    expect(toClientStatus("ACTIONED", "ESCALATE")).toBe("under_further_review");
    expect(toClientStatus("ACTIONED", "BLOCK")).toBe("not_approved");
  });

  it("hides FAILED as under_review regardless of action", () => {
    expect(toClientStatus("FAILED", null)).toBe("under_review");
    expect(toClientStatus("FAILED", "APPROVE")).toBe("under_review");
    expect(toClientStatus("FAILED", "REQUEST_DOCS")).toBe("under_review");
    expect(toClientStatus("FAILED", "BLOCK")).toBe("under_review");
  });

  it("gives REQUEST_DOCS and terminal actions precedence over the inferred status", () => {
    expect(toClientStatus("DRAFT", "REQUEST_DOCS")).toBe("needs_evidence");
    expect(toClientStatus("ACTIONED", "REQUEST_DOCS")).toBe("needs_evidence");
    expect(toClientStatus("DRAFT", "APPROVE")).toBe("approved");
  });

  it("treats OVERRIDE (and no action) as status-inferred", () => {
    expect(toClientStatus("DRAFT", "OVERRIDE")).toBe("submitted");
    expect(toClientStatus("QUEUED", "OVERRIDE")).toBe("submitted");
    expect(toClientStatus("RUNNING", "OVERRIDE")).toBe("under_review");
    expect(toClientStatus("ACTIONED", "OVERRIDE")).toBe("under_review");
    expect(toClientStatus("ACTIONED", null)).toBe("under_review");
  });

  it("is total: every status × action pair resolves to a valid ClientStatus", () => {
    const actions = [null, ...ReviewerActionEnum.options];
    for (const status of CaseStatusEnum.options) {
      for (const action of actions) {
        expect(ClientStatusEnum.options).toContain(toClientStatus(status, action));
      }
    }
  });
});

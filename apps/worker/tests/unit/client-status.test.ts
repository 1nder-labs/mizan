import { describe, expect, it } from "bun:test";
import {
  CaseStatusEnum,
  ClientStatusEnum,
  ReviewerActionEnum,
  toClientStatus,
} from "@mizan/shared";

/**
 * `toClientStatus` is the total (submitted × internal-status × latest-action) →
 * ClientStatus map (U7 + the draft model). These assertions encode the
 * authoritative table directly (literal expected values, not a
 * re-implementation), plus a totality sweep proving every combination resolves
 * to a valid ClientStatus. Submitted-case rows pass `true`; the draft rows pass
 * `false`.
 */
describe("toClientStatus", () => {
  it("maps the documented table rows", () => {
    expect(toClientStatus("DRAFT", null, true)).toBe("submitted");
    expect(toClientStatus("QUEUED", null, true)).toBe("submitted");
    expect(toClientStatus("RUNNING", null, true)).toBe("under_review");
    expect(toClientStatus("SUSPENDED_HITL", null, true)).toBe("under_review");
    expect(toClientStatus("READY_FOR_REVIEW", null, true)).toBe("under_review");
    expect(toClientStatus("RUNNING", "REQUEST_DOCS", true)).toBe("needs_evidence");
    expect(toClientStatus("READY_FOR_REVIEW", "REQUEST_DOCS", true)).toBe("needs_evidence");
    expect(toClientStatus("ACTIONED", "APPROVE", true)).toBe("approved");
    expect(toClientStatus("ACTIONED", "ESCALATE", true)).toBe("under_further_review");
    expect(toClientStatus("ACTIONED", "BLOCK", true)).toBe("not_approved");
  });

  it("maps an unsubmitted draft to draft regardless of status or action", () => {
    expect(toClientStatus("DRAFT", null, false)).toBe("draft");
    expect(toClientStatus("DRAFT", "REQUEST_DOCS", false)).toBe("draft");
    expect(toClientStatus("ACTIONED", "APPROVE", false)).toBe("draft");
    expect(toClientStatus("FAILED", null, false)).toBe("draft");
  });

  it("hides FAILED as under_review regardless of action", () => {
    expect(toClientStatus("FAILED", null, true)).toBe("under_review");
    expect(toClientStatus("FAILED", "APPROVE", true)).toBe("under_review");
    expect(toClientStatus("FAILED", "REQUEST_DOCS", true)).toBe("under_review");
    expect(toClientStatus("FAILED", "BLOCK", true)).toBe("under_review");
  });

  it("gives REQUEST_DOCS and terminal actions precedence over the inferred status", () => {
    expect(toClientStatus("DRAFT", "REQUEST_DOCS", true)).toBe("needs_evidence");
    expect(toClientStatus("ACTIONED", "REQUEST_DOCS", true)).toBe("needs_evidence");
    expect(toClientStatus("DRAFT", "APPROVE", true)).toBe("approved");
  });

  it("treats OVERRIDE (and no action) as status-inferred", () => {
    expect(toClientStatus("DRAFT", "OVERRIDE", true)).toBe("submitted");
    expect(toClientStatus("QUEUED", "OVERRIDE", true)).toBe("submitted");
    expect(toClientStatus("RUNNING", "OVERRIDE", true)).toBe("under_review");
    expect(toClientStatus("ACTIONED", "OVERRIDE", true)).toBe("under_review");
    expect(toClientStatus("ACTIONED", null, true)).toBe("under_review");
  });

  it("is total: every (submitted × status × action) resolves to a valid ClientStatus", () => {
    const actions = [null, ...ReviewerActionEnum.options];
    for (const submitted of [true, false]) {
      for (const status of CaseStatusEnum.options) {
        for (const action of actions) {
          expect(ClientStatusEnum.options).toContain(toClientStatus(status, action, submitted));
        }
      }
    }
  });
});

import { describe, expect, it } from "bun:test";
import {
  CaseStatusEnum,
  ClientStatusEnum,
  ReviewerActionEnum,
  toClientStatus,
} from "@mizan/shared";

/**
 * `toClientStatus` is the total (submitted × status × latest-action ×
 * clientResponded) → ClientStatus map, derived from the shared canonical
 * disposition. These assertions encode the authoritative table directly
 * (literal expected values), plus a totality sweep proving every combination
 * resolves to a valid ClientStatus. The last arg is whether the client has
 * responded to a docs request.
 */
describe("toClientStatus", () => {
  it("maps the documented table rows (not responded)", () => {
    expect(toClientStatus("DRAFT", null, true, false)).toBe("submitted");
    expect(toClientStatus("QUEUED", null, true, false)).toBe("submitted");
    expect(toClientStatus("RUNNING", null, true, false)).toBe("under_review");
    expect(toClientStatus("SUSPENDED_HITL", null, true, false)).toBe("under_review");
    expect(toClientStatus("READY_FOR_REVIEW", null, true, false)).toBe("under_review");
    expect(toClientStatus("RUNNING", "REQUEST_DOCS", true, false)).toBe("needs_evidence");
    expect(toClientStatus("ACTIONED", "REQUEST_DOCS", true, false)).toBe("needs_evidence");
    expect(toClientStatus("ACTIONED", "APPROVE", true, false)).toBe("approved");
    expect(toClientStatus("ACTIONED", "ESCALATE", true, false)).toBe("under_further_review");
    expect(toClientStatus("ACTIONED", "BLOCK", true, false)).toBe("not_approved");
  });

  it("flips needs_evidence → under_review once the client has responded", () => {
    expect(toClientStatus("ACTIONED", "REQUEST_DOCS", true, true)).toBe("under_review");
    expect(toClientStatus("ACTIONED", "ESCALATE", true, true)).toBe("under_review");
    // terminal decisions are unaffected by a client response
    expect(toClientStatus("ACTIONED", "APPROVE", true, true)).toBe("approved");
    expect(toClientStatus("ACTIONED", "BLOCK", true, true)).toBe("not_approved");
  });

  it("maps an unsubmitted draft to draft regardless of status, action, or response", () => {
    expect(toClientStatus("DRAFT", null, false, false)).toBe("draft");
    expect(toClientStatus("DRAFT", "REQUEST_DOCS", false, true)).toBe("draft");
    expect(toClientStatus("ACTIONED", "APPROVE", false, false)).toBe("draft");
    expect(toClientStatus("FAILED", null, false, false)).toBe("draft");
  });

  it("hides FAILED as under_review regardless of action", () => {
    expect(toClientStatus("FAILED", null, true, false)).toBe("under_review");
    expect(toClientStatus("FAILED", "APPROVE", true, false)).toBe("under_review");
    expect(toClientStatus("FAILED", "REQUEST_DOCS", true, true)).toBe("under_review");
    expect(toClientStatus("FAILED", "BLOCK", true, false)).toBe("under_review");
  });

  it("treats OVERRIDE and no-action as reviewed / status-inferred", () => {
    expect(toClientStatus("ACTIONED", "OVERRIDE", true, false)).toBe("under_review");
    expect(toClientStatus("DRAFT", "OVERRIDE", true, false)).toBe("under_review");
    expect(toClientStatus("ACTIONED", null, true, false)).toBe("under_review");
  });

  it("is total: every (submitted × status × action × responded) resolves to a valid ClientStatus", () => {
    const actions = [null, ...ReviewerActionEnum.options];
    for (const submitted of [true, false]) {
      for (const responded of [true, false]) {
        for (const status of CaseStatusEnum.options) {
          for (const action of actions) {
            expect(ClientStatusEnum.options).toContain(
              toClientStatus(status, action, submitted, responded),
            );
          }
        }
      }
    }
  });
});

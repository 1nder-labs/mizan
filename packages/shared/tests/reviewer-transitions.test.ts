import { describe, expect, test } from "bun:test";
import {
  canReviewerTransition,
  REVIEWER_TRANSITIONS,
} from "../src/schemas/reviewer-transitions.ts";

describe("canReviewerTransition", () => {
  test("DRAFT → QUEUED is allowed (POST /brief enqueue)", () => {
    expect(canReviewerTransition("DRAFT", "QUEUED")).toBe(true);
  });

  test("SUSPENDED_HITL → ACTIONED is allowed (POST /action modal)", () => {
    expect(canReviewerTransition("SUSPENDED_HITL", "ACTIONED")).toBe(true);
  });

  test("RUNNING → ACTIONED is rejected (workflow-driven, not reviewer-driven)", () => {
    expect(canReviewerTransition("RUNNING", "ACTIONED")).toBe(false);
  });

  test("QUEUED → RUNNING is rejected (workflow-driven)", () => {
    expect(canReviewerTransition("QUEUED", "RUNNING")).toBe(false);
  });

  test("READY_FOR_REVIEW → ACTIONED is allowed (actions.ts accepts both source statuses)", () => {
    expect(canReviewerTransition("READY_FOR_REVIEW", "ACTIONED")).toBe(true);
  });

  test("FAILED → DRAFT is rejected (terminal for reviewer)", () => {
    expect(canReviewerTransition("FAILED", "DRAFT")).toBe(false);
  });

  test("ACTIONED → anything is rejected", () => {
    for (const target of [
      "DRAFT",
      "QUEUED",
      "RUNNING",
      "SUSPENDED_HITL",
      "READY_FOR_REVIEW",
      "FAILED",
    ] as const) {
      expect(canReviewerTransition("ACTIONED", target)).toBe(false);
    }
  });

  test("REVIEWER_TRANSITIONS has an entry for every CaseStatus value", () => {
    const expectedStatuses = [
      "DRAFT",
      "QUEUED",
      "RUNNING",
      "SUSPENDED_HITL",
      "READY_FOR_REVIEW",
      "ACTIONED",
      "FAILED",
    ] as const;
    for (const status of expectedStatuses) {
      expect(REVIEWER_TRANSITIONS[status]).toBeDefined();
    }
  });
});

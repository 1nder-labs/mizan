import { describe, expect, test } from "bun:test";
import {
  briefRerunAffordance,
  deriveCaseDisposition,
  isTerminalDisposition,
  REVIEWER_DISPOSITION_LABEL,
  type CaseDisposition,
} from "../src/schemas/case-disposition.ts";
import { CASE_STATUS_VALUES, type CaseStatus } from "../src/schemas/queue-search.ts";
import { ReviewerActionEnum, type ReviewerAction } from "../src/schemas/reviewer-action.ts";

/**
 * Every disposition the derivation can produce, written out independently of
 * the production module so a dropped or renamed value fails this list rather
 * than silently passing. Kept in sync via the label-map drift check below.
 */
const ALL_DISPOSITIONS: readonly CaseDisposition[] = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "AWAITING_REVIEWER",
  "NEEDS_CLIENT_DOCS",
  "CLIENT_REPLIED",
  "ESCALATED",
  "APPROVED",
  "DECLINED",
  "REVIEWED",
  "FAILED",
];

interface Scenario {
  readonly name: string;
  readonly status: CaseStatus;
  readonly latestAction: ReviewerAction | null;
  readonly clientResponded: boolean;
  readonly submitted: boolean;
  readonly expected: CaseDisposition;
}

/**
 * Hand-written truth table. Expected values are asserted literals, NOT computed
 * by re-running the precedence chain, so this is an independent oracle. Ordered
 * to pin the dangerous collisions where two inputs both claim the case.
 */
const SCENARIOS: readonly Scenario[] = [
  {
    name: "unsubmitted dominates every other input",
    status: "SUSPENDED_HITL",
    latestAction: "APPROVE",
    clientResponded: true,
    submitted: false,
    expected: "DRAFT",
  },
  {
    name: "unsubmitted + FAILED status still reads DRAFT (submitted gate is first)",
    status: "FAILED",
    latestAction: "BLOCK",
    clientResponded: false,
    submitted: false,
    expected: "DRAFT",
  },
  {
    name: "FAILED status beats a terminal APPROVE (infra failure never leaks as a decision)",
    status: "FAILED",
    latestAction: "APPROVE",
    clientResponded: false,
    submitted: true,
    expected: "FAILED",
  },
  {
    name: "FAILED status beats BLOCK",
    status: "FAILED",
    latestAction: "BLOCK",
    clientResponded: true,
    submitted: true,
    expected: "FAILED",
  },
  {
    name: "APPROVE beats SUSPENDED_HITL status",
    status: "SUSPENDED_HITL",
    latestAction: "APPROVE",
    clientResponded: false,
    submitted: true,
    expected: "APPROVED",
  },
  {
    name: "APPROVE is terminal regardless of clientResponded",
    status: "ACTIONED",
    latestAction: "APPROVE",
    clientResponded: true,
    submitted: true,
    expected: "APPROVED",
  },
  {
    name: "BLOCK is terminal regardless of clientResponded",
    status: "ACTIONED",
    latestAction: "BLOCK",
    clientResponded: true,
    submitted: true,
    expected: "DECLINED",
  },
  {
    name: "REQUEST_DOCS + not responded → awaiting client docs",
    status: "ACTIONED",
    latestAction: "REQUEST_DOCS",
    clientResponded: false,
    submitted: true,
    expected: "NEEDS_CLIENT_DOCS",
  },
  {
    name: "REQUEST_DOCS + responded → client replied (re-review owed)",
    status: "ACTIONED",
    latestAction: "REQUEST_DOCS",
    clientResponded: true,
    submitted: true,
    expected: "CLIENT_REPLIED",
  },
  {
    name: "ESCALATE + not responded → escalated",
    status: "ACTIONED",
    latestAction: "ESCALATE",
    clientResponded: false,
    submitted: true,
    expected: "ESCALATED",
  },
  {
    name: "ESCALATE + responded → client replied (response collapses both pending actions)",
    status: "ACTIONED",
    latestAction: "ESCALATE",
    clientResponded: true,
    submitted: true,
    expected: "CLIENT_REPLIED",
  },
  {
    name: "OVERRIDE → reviewed",
    status: "ACTIONED",
    latestAction: "OVERRIDE",
    clientResponded: false,
    submitted: true,
    expected: "REVIEWED",
  },
  {
    name: "SUSPENDED_HITL + no action → awaiting reviewer",
    status: "SUSPENDED_HITL",
    latestAction: null,
    clientResponded: false,
    submitted: true,
    expected: "AWAITING_REVIEWER",
  },
  {
    name: "DRAFT status + no action + submitted → submitted (not yet briefed)",
    status: "DRAFT",
    latestAction: null,
    clientResponded: false,
    submitted: true,
    expected: "SUBMITTED",
  },
  {
    name: "QUEUED + no action → submitted",
    status: "QUEUED",
    latestAction: null,
    clientResponded: false,
    submitted: true,
    expected: "SUBMITTED",
  },
  {
    name: "RUNNING + no action → in review",
    status: "RUNNING",
    latestAction: null,
    clientResponded: false,
    submitted: true,
    expected: "IN_REVIEW",
  },
  {
    name: "RUNNING + no action → in review",
    status: "RUNNING",
    latestAction: null,
    clientResponded: false,
    submitted: true,
    expected: "IN_REVIEW",
  },
  {
    name: "ACTIONED + no recorded action → in review (degraded, never crashes)",
    status: "ACTIONED",
    latestAction: null,
    clientResponded: false,
    submitted: true,
    expected: "IN_REVIEW",
  },
  {
    name: "clientResponded is ignored when no action requires it",
    status: "RUNNING",
    latestAction: null,
    clientResponded: true,
    submitted: true,
    expected: "IN_REVIEW",
  },
];

describe("deriveCaseDisposition — precedence truth table", () => {
  for (const s of SCENARIOS) {
    test(s.name, () => {
      const actual = deriveCaseDisposition({
        status: s.status,
        latestAction: s.latestAction,
        clientResponded: s.clientResponded,
        submitted: s.submitted,
      });
      expect(actual).toBe(s.expected);
    });
  }
});

describe("deriveCaseDisposition — totality sweep", () => {
  const actions: readonly (ReviewerAction | null)[] = [null, ...ReviewerActionEnum.options];
  const labelKeys = new Set<string>(Object.keys(REVIEWER_DISPOSITION_LABEL));

  test("every (submitted × status × action × responded) combo returns a known disposition", () => {
    for (const submitted of [true, false]) {
      for (const status of CASE_STATUS_VALUES) {
        for (const latestAction of actions) {
          for (const clientResponded of [true, false]) {
            const result = deriveCaseDisposition({
              status,
              latestAction,
              clientResponded,
              submitted,
            });
            expect(labelKeys.has(result)).toBe(true);
          }
        }
      }
    }
  });
});

describe("REVIEWER_DISPOSITION_LABEL", () => {
  test("has a non-empty label for every disposition", () => {
    for (const d of ALL_DISPOSITIONS) {
      expect(REVIEWER_DISPOSITION_LABEL[d].length).toBeGreaterThan(0);
    }
  });

  test("has no labels beyond the known dispositions (drift guard)", () => {
    expect(Object.keys(REVIEWER_DISPOSITION_LABEL).sort()).toEqual([...ALL_DISPOSITIONS].sort());
  });
});

describe("isTerminalDisposition", () => {
  test("APPROVED and DECLINED are terminal", () => {
    expect(isTerminalDisposition("APPROVED")).toBe(true);
    expect(isTerminalDisposition("DECLINED")).toBe(true);
  });

  test("every other disposition is non-terminal (re-run stays available)", () => {
    const nonTerminal = ALL_DISPOSITIONS.filter((d) => d !== "APPROVED" && d !== "DECLINED");
    for (const d of nonTerminal) {
      expect(isTerminalDisposition(d)).toBe(false);
    }
  });
});

describe("briefRerunAffordance", () => {
  test("terminal dispositions hide the re-run", () => {
    expect(briefRerunAffordance("APPROVED")).toBe("hidden");
    expect(briefRerunAffordance("DECLINED")).toBe("hidden");
  });

  test("CLIENT_REPLIED gets the promoted bar", () => {
    expect(briefRerunAffordance("CLIENT_REPLIED")).toBe("promoted-bar");
  });

  test("every other non-terminal disposition gets the in-tab re-run", () => {
    const inTab = ALL_DISPOSITIONS.filter(
      (d) => d !== "APPROVED" && d !== "DECLINED" && d !== "CLIENT_REPLIED",
    );
    for (const d of inTab) {
      expect(briefRerunAffordance(d)).toBe("in-tab");
    }
  });

  test("is total over every disposition (no undefined arm)", () => {
    for (const d of ALL_DISPOSITIONS) {
      expect(["hidden", "in-tab", "promoted-bar"]).toContain(briefRerunAffordance(d));
    }
  });
});

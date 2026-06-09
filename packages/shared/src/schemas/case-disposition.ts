import type { CaseStatus } from "./queue-search.ts";
import type { ReviewerAction } from "./reviewer-action.ts";

/**
 * Canonical, audience-neutral disposition of a case, derived from the internal
 * pipeline `cases.status` + the latest reviewer action + whether the client has
 * responded + whether the campaign is submitted. The pipeline enum stays the
 * single source of truth for the producer-guard / idempotency; this is the one
 * place that turns it into something a human can read, so reviewer + client
 * label maps are thin maps over THIS — no duplicated precedence logic.
 *
 * Precedence (latest reviewer action dominates the raw pipeline status, because
 * a case that has been acted on should read as the disposition of that action,
 * not "Actioned"; FAILED is checked first so an infra failure never leaks as a
 * decision and a re-run failure reads correctly):
 *   !submitted                  → DRAFT
 *   FAILED                      → FAILED
 *   APPROVE                     → APPROVED      (terminal)
 *   BLOCK                       → DECLINED      (terminal)
 *   REQUEST_DOCS + !responded   → NEEDS_CLIENT_DOCS
 *   REQUEST_DOCS +  responded   → CLIENT_REPLIED
 *   ESCALATE     + !responded   → ESCALATED
 *   ESCALATE     +  responded   → CLIENT_REPLIED
 *   OVERRIDE                    → REVIEWED
 *   SUSPENDED_HITL              → AWAITING_REVIEWER
 *   DRAFT | QUEUED              → SUBMITTED     (submitted, not briefed yet)
 *   else (RUNNING | READY)      → IN_REVIEW
 */
const CASE_DISPOSITION_VALUES = [
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
] as const;

export type CaseDisposition = (typeof CASE_DISPOSITION_VALUES)[number];

interface DispositionInput {
  readonly status: CaseStatus;
  readonly latestAction: ReviewerAction | null;
  readonly clientResponded: boolean;
  readonly submitted: boolean;
}

/** Derives the canonical disposition. Total over every input combination. */
export function deriveCaseDisposition(input: DispositionInput): CaseDisposition {
  const { status, latestAction, clientResponded } = input;
  if (!input.submitted) return "DRAFT";
  if (status === "FAILED") return "FAILED";
  if (latestAction === "APPROVE") return "APPROVED";
  if (latestAction === "BLOCK") return "DECLINED";
  if (latestAction === "REQUEST_DOCS") {
    return clientResponded ? "CLIENT_REPLIED" : "NEEDS_CLIENT_DOCS";
  }
  if (latestAction === "ESCALATE") return clientResponded ? "CLIENT_REPLIED" : "ESCALATED";
  if (latestAction === "OVERRIDE") return "REVIEWED";
  if (status === "SUSPENDED_HITL") return "AWAITING_REVIEWER";
  if (status === "DRAFT" || status === "QUEUED") return "SUBMITTED";
  return "IN_REVIEW";
}

/** Reviewer-facing label for each disposition (ops-honest, unlike the raw enum). */
export const REVIEWER_DISPOSITION_LABEL: Record<CaseDisposition, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  AWAITING_REVIEWER: "Awaiting your action",
  NEEDS_CLIENT_DOCS: "Needs client docs",
  CLIENT_REPLIED: "Client replied",
  ESCALATED: "Escalated",
  APPROVED: "Approved",
  DECLINED: "Declined",
  REVIEWED: "Reviewed",
  FAILED: "Failed",
};

const TERMINAL_DISPOSITIONS: ReadonlySet<CaseDisposition> = new Set<CaseDisposition>([
  "APPROVED",
  "DECLINED",
]);

/** True when the case is settled (approved/declined) — no re-run is offered. */
export function isTerminalDisposition(disposition: CaseDisposition): boolean {
  return TERMINAL_DISPOSITIONS.has(disposition);
}

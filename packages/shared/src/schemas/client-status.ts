import { z } from "zod";
import type { CaseStatus } from "./queue-search.ts";
import type { ReviewerAction } from "./reviewer-action.ts";

/** Friendly, internals-free campaign status shown to a client. */
export const ClientStatusEnum = z.enum([
  "submitted",
  "under_review",
  "needs_evidence",
  "approved",
  "under_further_review",
  "not_approved",
]);
export type ClientStatus = z.infer<typeof ClientStatusEnum>;

/**
 * Maps an internal `cases.status` + the latest reviewer action onto exactly one
 * client status. Total over every (status × action) pair. Precedence:
 *
 *   FAILED            → under_review        (infra failure is never shown; ops monitors FAILED)
 *   * + REQUEST_DOCS  → needs_evidence      (latest REQUEST_DOCS takes precedence over the status)
 *   * + APPROVE       → approved
 *   * + ESCALATE      → under_further_review
 *   * + BLOCK         → not_approved
 *   DRAFT | QUEUED    → submitted           (no decisive action yet)
 *   else              → under_review        (RUNNING / SUSPENDED_HITL / READY_FOR_REVIEW, OVERRIDE, …)
 */
export function toClientStatus(
  caseStatus: CaseStatus,
  latestAction: ReviewerAction | null,
): ClientStatus {
  if (caseStatus === "FAILED") return "under_review";
  if (latestAction === "REQUEST_DOCS") return "needs_evidence";
  if (latestAction === "APPROVE") return "approved";
  if (latestAction === "ESCALATE") return "under_further_review";
  if (latestAction === "BLOCK") return "not_approved";
  if (caseStatus === "DRAFT" || caseStatus === "QUEUED") return "submitted";
  return "under_review";
}

import { z } from "zod";
import type { CaseStatus } from "./queue-search.ts";
import type { ReviewerAction } from "./reviewer-action.ts";
import { deriveCaseDisposition, type CaseDisposition } from "./case-disposition.ts";

/** Friendly, internals-free campaign status shown to a client. */
export const ClientStatusEnum = z.enum([
  "draft",
  "submitted",
  "under_review",
  "needs_evidence",
  "approved",
  "under_further_review",
  "not_approved",
]);
export type ClientStatus = z.infer<typeof ClientStatusEnum>;

/**
 * Maps the canonical disposition to the client-facing status. Infra/ops states
 * (FAILED, awaiting-reviewer) collapse to `under_review` so internals never
 * leak; `CLIENT_REPLIED` is `under_review` (the client has replied — it is now
 * the reviewer's turn), distinct from `needs_evidence` (the client's turn).
 */
const DISPOSITION_TO_CLIENT: Record<CaseDisposition, ClientStatus> = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  IN_REVIEW: "under_review",
  AWAITING_REVIEWER: "under_review",
  NEEDS_CLIENT_DOCS: "needs_evidence",
  CLIENT_REPLIED: "under_review",
  ESCALATED: "under_further_review",
  APPROVED: "approved",
  DECLINED: "not_approved",
  REVIEWED: "under_review",
  FAILED: "under_review",
};

/**
 * Maps internal `cases.status` + latest reviewer action + submitted + whether
 * the client has responded onto exactly one client status, via the shared
 * canonical disposition. Adding `clientResponded` fixes the case where a client
 * who has already replied still saw "needs your documents".
 */
export function toClientStatus(
  caseStatus: CaseStatus,
  latestAction: ReviewerAction | null,
  submitted: boolean,
  clientResponded: boolean,
): ClientStatus {
  return DISPOSITION_TO_CLIENT[
    deriveCaseDisposition({ status: caseStatus, latestAction, clientResponded, submitted })
  ];
}

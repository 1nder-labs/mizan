/**
 * Queue outcome-disposition SQL: the latest-reviewer-action projection, the
 * `outcome` filter translation, and the escalated-first ordering. Separated
 * from `cases-handler.ts` so the disposition concern lives in one place.
 *
 * The board shows raw pipeline `status` lanes; these helpers let a reviewer
 * narrow by OUTCOME (escalated / needs-docs / approved / declined / awaiting)
 * and surface the per-row action so the card can render its disposition badge.
 */
import { asc, desc, eq, inArray, not, sql, type SQL } from "drizzle-orm";
import { cases as casesTable, reviewer_actions } from "@mizan/db";
import { isClientResponded } from "../lib/case-notes.ts";
import type {
  CaseDisposition,
  CaseRow,
  LatestBriefProjection,
  QueueSort,
  ReviewerAction,
} from "@mizan/shared";

export interface PublicCaseColumns {
  readonly id: string;
  readonly status: CaseRow["status"];
  readonly title: string;
  readonly category: string;
  readonly geography: string;
  readonly claimed_zakat_category: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly assigned_to: string | null;
}

export interface CaseRowExtras {
  readonly latestBrief: LatestBriefProjection | null;
  readonly clientSubmitted: boolean;
  readonly latestAction: ReviewerAction | null;
  readonly clientResponded: boolean;
}

/** Maps shared public case columns + the resolved disposition extras to a wire `CaseRow`. */
export function mapCaseRow(row: PublicCaseColumns, extras: CaseRowExtras): CaseRow {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    category: row.category,
    geography: row.geography,
    claimed_zakat_category: row.claimed_zakat_category,
    created_at: row.created_at.getTime(),
    updated_at: row.updated_at.getTime(),
    latest_brief: extras.latestBrief,
    assigned_to: row.assigned_to,
    client_submitted: extras.clientSubmitted,
    latest_action: extras.latestAction,
    client_responded: extras.clientResponded,
  };
}

/** Correlated subquery: the action of the most recent reviewer action on a case. */
function latestActionExpr(): SQL<ReviewerAction | null> {
  return sql<ReviewerAction | null>`(
    SELECT ${reviewer_actions.action} FROM ${reviewer_actions}
    WHERE ${reviewer_actions.case_id} = ${casesTable.id}
    ORDER BY ${reviewer_actions.acted_at} DESC LIMIT 1
  )`;
}

/** Correlated subquery: the epoch-ms timestamp of that most recent action. */
function latestActedAtExpr(): SQL<number | null> {
  return sql<number | null>`(
    SELECT ${reviewer_actions.acted_at} FROM ${reviewer_actions}
    WHERE ${reviewer_actions.case_id} = ${casesTable.id}
    ORDER BY ${reviewer_actions.acted_at} DESC LIMIT 1
  )`;
}

/** Projection columns the queue row needs to derive its disposition badge. */
export function latestActionCols() {
  return { latestAction: latestActionExpr(), latestActedAt: latestActedAtExpr() } as const;
}

/** Re-derives `client_responded` from a queue row's projected action timing. */
export function clientRespondedFromRow(
  latestAction: ReviewerAction | null,
  latestActedAt: number | null,
  submittedAtMs: number | null,
): boolean {
  if (latestAction === null || latestActedAt === null) return false;
  return isClientResponded({ action: latestAction, actedAtMs: latestActedAt }, submittedAtMs);
}

/**
 * True when the client supplied fresh evidence after the most recent reviewer
 * action. Parameter-free (column refs + the scalar subquery only) — no user
 * input is interpolated, so the `sql` plumbing carries no injection surface.
 */
function respondedExpr(): SQL {
  return sql`${casesTable.submitted_at} IS NOT NULL AND ${casesTable.submitted_at} > ${latestActedAtExpr()}`;
}

/** `status = ACTIONED` AND the latest action equals `action` (value bound by `eq`). */
function actionedWith(action: ReviewerAction): SQL[] {
  return [eq(casesTable.status, "ACTIONED"), eq(latestActionExpr(), action)];
}

/**
 * Translates a canonical `CaseDisposition` into the WHERE conditions that select
 * cases reaching it — the inverse of `deriveCaseDisposition` over its raw inputs
 * (status, latest action, client-responded), as direct column comparisons via
 * drizzle builders, not a re-implementation of its precedence. Returns a
 * condition array the caller ANDs into the queue filter. Exhaustive over every
 * disposition so a new value is a compile error here.
 */
export function buildOutcomeFilter(outcome: CaseDisposition): SQL[] {
  switch (outcome) {
    case "DRAFT":
      return [eq(casesTable.status, "DRAFT")];
    case "SUBMITTED":
      return [eq(casesTable.status, "QUEUED")];
    case "IN_REVIEW":
      return [eq(casesTable.status, "RUNNING")];
    case "AWAITING_REVIEWER":
      return [eq(casesTable.status, "SUSPENDED_HITL")];
    case "FAILED":
      return [eq(casesTable.status, "FAILED")];
    case "ESCALATED":
      return [...actionedWith("ESCALATE"), not(respondedExpr())];
    case "NEEDS_CLIENT_DOCS":
      return [...actionedWith("REQUEST_DOCS"), not(respondedExpr())];
    case "CLIENT_REPLIED":
      return [
        eq(casesTable.status, "ACTIONED"),
        inArray(latestActionExpr(), ["REQUEST_DOCS", "ESCALATE"]),
        respondedExpr(),
      ];
    case "APPROVED":
      return actionedWith("APPROVE");
    case "DECLINED":
      return actionedWith("BLOCK");
    case "REVIEWED":
      return actionedWith("OVERRIDE");
  }
}

/**
 * Queue ordering. Escalations sort to the very top (they need attention) ahead
 * of the reviewer's chosen sort, so an admin scanning the board sees them first.
 */
export function buildQueueOrder(sort: QueueSort): SQL[] {
  const escalatedFirst = sql`CASE WHEN ${latestActionExpr()} = 'ESCALATE' THEN 0 ELSE 1 END`;
  if (sort === "updated_asc") return [escalatedFirst, asc(casesTable.updated_at)];
  if (sort === "created_desc") return [escalatedFirst, desc(casesTable.created_at)];
  return [escalatedFirst, desc(casesTable.updated_at)];
}

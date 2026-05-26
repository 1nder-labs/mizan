/**
 * Reviewer-driven case-status transitions — the closed set of moves a
 * reviewer can fire from the UI (drag in `/queue?view=board`, action
 * button in case detail). Shared between client (drag-validation,
 * instant UX) and server (defense-in-depth re-validation on the mutation
 * route).
 *
 * Two transitions only:
 *   - DRAFT → QUEUED via `POST /api/cases/:id/brief` (Mode B enqueue).
 *   - SUSPENDED_HITL → ACTIONED via `POST /api/cases/:id/action` (with
 *     rationale + action_id from the action modal).
 *
 * `READY_FOR_REVIEW → ACTIONED` is intentionally absent: `apps/worker/
 * src/routes/actions.ts` only handles the `SUSPENDED_HITL → RUNNING →
 * ACTIONED` claim. Adding `READY_FOR_REVIEW` would require route
 * changes outside Phase 7.5's scope; the map updates in the same PR if
 * that lands later.
 *
 * Workflow-owned statuses (`QUEUED`, `RUNNING`) have empty arrays so
 * `canReviewerTransition` returns `false` for any move out of them —
 * the Kanban board renders those columns with `useDroppable.disabled`.
 */
import { type CaseStatus } from "./queue-search.ts";

export const REVIEWER_TRANSITIONS: Readonly<Record<CaseStatus, ReadonlyArray<CaseStatus>>> = {
  DRAFT: ["QUEUED"],
  QUEUED: [],
  RUNNING: [],
  SUSPENDED_HITL: ["ACTIONED"],
  READY_FOR_REVIEW: [],
  ACTIONED: [],
  FAILED: [],
} as const;

/** Pure predicate the board's drag-end handler and route guards both call. */
export function canReviewerTransition(from: CaseStatus, to: CaseStatus): boolean {
  return REVIEWER_TRANSITIONS[from].includes(to);
}

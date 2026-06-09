import type { CaseStatus } from "./queue-search.ts";

/**
 * Statuses where the case has stopped progressing on its own — either
 * reviewer-actioned or terminally failed. Used by the SSE stream route to
 * skip live-tail polling and by the web client to derive UI panel modes.
 */
export const TERMINAL_CASE_STATUSES: ReadonlySet<CaseStatus> = new Set<CaseStatus>([
  "ACTIONED",
  "FAILED",
]);

/** Status during which the HITL gate is open and the reviewer can act. */
export const HITL_SUSPENDED_STATUS = "SUSPENDED_HITL" as const satisfies CaseStatus;

/**
 * Statuses where the case is actively progressing in the workflow.
 * Either Mastra is mid-step (`RUNNING`) or the queue producer just
 * claimed the row (`QUEUED`).
 */
export const ACTIVE_CASE_STATUSES: ReadonlySet<CaseStatus> = new Set<CaseStatus>([
  "QUEUED",
  "RUNNING",
]);

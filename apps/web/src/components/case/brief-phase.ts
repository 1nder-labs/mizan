/**
 * Brief-panel phase machine + mode derivation, split from `detail.tsx` so its
 * stale-trigger reset rules are unit-testable (see brief-phase.test.ts).
 *
 * `userTriggered` records that the reviewer explicitly started a run (Generate
 * or re-run); `streamErrored` records that the SSE stream died mid-flight.
 *
 * Critical invariant: `userTriggered` is reset the moment the run SETTLES — any
 * terminal status OR `SUSPENDED_HITL` — not terminal-only. Without the
 * SUSPENDED_HITL reset, a Generate's trigger leaks through the HITL gate (where
 * the mode is "action" regardless) into the post-action ACTIONED render, where
 * `deriveMode` would return "stream" and BriefStream would auto-POST a spurious
 * second workflow run.
 */
import {
  ACTIVE_CASE_STATUSES,
  HITL_SUSPENDED_STATUS,
  TERMINAL_CASE_STATUSES,
  type CaseStatus,
} from "@mizan/shared";
import type { BriefPanelMode, BriefSummary } from "./case-tabs.tsx";

export type { BriefSummary };

export interface StreamPhase {
  readonly userTriggered: boolean;
  readonly streamErrored: boolean;
}

export type PhaseEvent =
  | { readonly type: "case-changed" }
  | { readonly type: "status-changed"; readonly status: CaseStatus }
  | { readonly type: "user-generated" }
  | { readonly type: "stream-errored" };

export const INITIAL_PHASE: StreamPhase = { userTriggered: false, streamErrored: false };

const SHOW_PERSISTED_STATUSES: ReadonlySet<CaseStatus> = new Set<CaseStatus>(["ACTIONED"]);

export function phaseReducer(state: StreamPhase, event: PhaseEvent): StreamPhase {
  switch (event.type) {
    case "case-changed":
      return INITIAL_PHASE;
    case "status-changed":
      return TERMINAL_CASE_STATUSES.has(event.status) || event.status === HITL_SUSPENDED_STATUS
        ? INITIAL_PHASE
        : state;
    case "user-generated":
      return { userTriggered: true, streamErrored: false };
    case "stream-errored":
      return { ...state, streamErrored: true };
  }
}

export function deriveMode(
  status: CaseStatus,
  brief: BriefSummary,
  phase: StreamPhase,
): BriefPanelMode {
  if (status === HITL_SUSPENDED_STATUS) return "action";
  if (phase.userTriggered && !phase.streamErrored) return "stream";
  if (ACTIVE_CASE_STATUSES.has(status)) return "inflight";
  if (brief && SHOW_PERSISTED_STATUSES.has(status)) return "summary";
  return "empty";
}

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
 *
 * Resume-stream design: ACTIVE_CASE_STATUSES (RUNNING/QUEUED) now map to
 * `"stream"` with `autoStart=false`, so the durable-buffer GET reconnect fires
 * on mount rather than a new POST. A 204 from the resume endpoint (no active DO
 * buffer yet for QUEUED) is a SDK-level no-op and does not trigger an error.
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

/**
 * Returns the panel mode and whether the stream component should
 * auto-POST (autoStart) or only resume via GET.
 *
 * - `stream` with `autoStart:true` — reviewer clicked Generate; POST fires.
 * - `stream` with `autoStart:false` — case is already RUNNING/QUEUED from
 *   another session; the SDK resume-GET reconnects to the buffered stream.
 */
export interface DerivedMode {
  readonly mode: BriefPanelMode;
  readonly autoStart: boolean;
}

export function deriveMode(
  status: CaseStatus,
  brief: BriefSummary,
  phase: StreamPhase,
): DerivedMode {
  if (status === HITL_SUSPENDED_STATUS) return { mode: "action", autoStart: false };
  if (phase.userTriggered && !phase.streamErrored) return { mode: "stream", autoStart: true };
  if (ACTIVE_CASE_STATUSES.has(status)) return { mode: "stream", autoStart: false };
  if (brief && SHOW_PERSISTED_STATUSES.has(status)) return { mode: "summary", autoStart: false };
  return { mode: "empty", autoStart: false };
}

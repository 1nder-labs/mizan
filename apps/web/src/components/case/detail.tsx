/**
 * Case-detail container — composes the header, meta side card, and
 * the right-side brief panel. The panel mode is derived from the
 * server-truth status, the persisted brief, and a local stream-phase
 * machine; no boolean state masquerades as a state machine.
 *
 * Panel modes:
 *   stream   — user just clicked Generate and the local stream has not
 *              yet errored; mounts <BriefStream> which POSTs /brief
 *   inflight — server says the case is already RUNNING/QUEUED from a
 *              prior tab or session; the workflow_events tape drives a
 *              passive refetch when the run finishes. Never POSTs.
 *   action   — SUSPENDED_HITL awaiting reviewer input
 *   summary  — terminal status with a non-null brief payload
 *   empty    — every other state
 *
 * The split between `stream` and `inflight` is the bug fix for the
 * "page-load fires POST /brief" issue: visiting a RUNNING case from a
 * URL paste or a refresh used to auto-mount `<BriefStream>` (which
 * POSTs on every render), re-firing the producer guard and hammering
 * the worker with 409s. The user must explicitly press Generate to
 * own a new run; an already-running run is observed passively.
 */
import { useEffect, useReducer } from "react";
import {
  ACTIVE_CASE_STATUSES,
  HITL_SUSPENDED_STATUS,
  TERMINAL_CASE_STATUSES,
  type CaseDetailResponse,
  type CaseRow,
  type CaseStatus,
} from "@mizan/shared";
import { useWorkflowTapeInvalidation } from "@/components/brief/use-workflow-tape-invalidation.ts";
import { useCaseDetailLiveEvents } from "@/hooks/use-case-detail-live-events.ts";
import { CaseHeader } from "./header.tsx";
import { CaseTabs, type BriefPanelMode } from "./case-tabs.tsx";
import { type CaseOverlay } from "@mizan/shared";

type BriefSummary = CaseDetailResponse["brief"];

interface CaseDetailProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly overlay: CaseOverlay | null;
  readonly clientResponded: boolean;
}

const SHOW_PERSISTED_STATUSES: ReadonlySet<CaseStatus> = new Set<CaseStatus>([
  "READY_FOR_REVIEW",
  "ACTIONED",
]);

interface StreamPhase {
  readonly userTriggered: boolean;
  readonly streamErrored: boolean;
}

type PhaseEvent =
  | { readonly type: "case-changed" }
  | { readonly type: "status-changed"; readonly status: CaseStatus }
  | { readonly type: "user-generated" }
  | { readonly type: "stream-errored" };

const INITIAL_PHASE: StreamPhase = { userTriggered: false, streamErrored: false };

function phaseReducer(state: StreamPhase, event: PhaseEvent): StreamPhase {
  switch (event.type) {
    case "case-changed":
      return INITIAL_PHASE;
    case "status-changed":
      return TERMINAL_CASE_STATUSES.has(event.status) ? INITIAL_PHASE : state;
    case "user-generated":
      return { userTriggered: true, streamErrored: false };
    case "stream-errored":
      return { ...state, streamErrored: true };
  }
}

function deriveMode(status: CaseStatus, brief: BriefSummary, phase: StreamPhase): BriefPanelMode {
  if (status === HITL_SUSPENDED_STATUS) return "action";
  if (phase.userTriggered && !phase.streamErrored) return "stream";
  if (ACTIVE_CASE_STATUSES.has(status)) return "inflight";
  if (brief && SHOW_PERSISTED_STATUSES.has(status)) return "summary";
  return "empty";
}

interface DetailLayoutProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly overlay: CaseOverlay | null;
  readonly clientResponded: boolean;
  readonly mode: BriefPanelMode;
  readonly onGenerate: () => void;
  readonly onStreamError: () => void;
}

/** Always-visible header above the tabbed body. */
function DetailLayout({
  caseRow,
  brief,
  overlay,
  clientResponded,
  mode,
  onGenerate,
  onStreamError,
}: DetailLayoutProps): React.JSX.Element {
  return (
    <article className="w-full space-y-8 px-6 py-8">
      <CaseHeader caseRow={caseRow} clientResponded={clientResponded} />
      <CaseTabs
        caseRow={caseRow}
        brief={brief}
        overlay={overlay}
        mode={mode}
        onGenerate={onGenerate}
        onStreamError={onStreamError}
      />
    </article>
  );
}

export function CaseDetail({
  caseRow,
  brief,
  overlay,
  clientResponded,
}: CaseDetailProps): React.JSX.Element {
  const [phase, dispatchPhase] = useReducer(phaseReducer, INITIAL_PHASE);
  const tapeEnabled =
    ACTIVE_CASE_STATUSES.has(caseRow.status) || caseRow.status === HITL_SUSPENDED_STATUS;
  useWorkflowTapeInvalidation(caseRow.id, tapeEnabled);
  useCaseDetailLiveEvents(caseRow);

  useEffect(() => {
    dispatchPhase({ type: "case-changed" });
  }, [caseRow.id]);
  useEffect(() => {
    dispatchPhase({ type: "status-changed", status: caseRow.status });
  }, [caseRow.status]);

  return (
    <DetailLayout
      caseRow={caseRow}
      brief={brief}
      overlay={overlay}
      clientResponded={clientResponded}
      mode={deriveMode(caseRow.status, brief, phase)}
      onGenerate={() => dispatchPhase({ type: "user-generated" })}
      onStreamError={() => dispatchPhase({ type: "stream-errored" })}
    />
  );
}

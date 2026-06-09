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
  deriveCaseDisposition,
  isTerminalDisposition,
  type CaseDisposition,
  type CaseOverlay,
  type CaseRow,
  type ReviewerAction,
} from "@mizan/shared";
import { useWorkflowTapeInvalidation } from "@/components/brief/use-workflow-tape-invalidation.ts";
import { useCaseDetailLiveEvents } from "@/hooks/use-case-detail-live-events.ts";
import { CaseHeader } from "./header.tsx";
import { CaseTabs, type BriefPanelMode } from "./case-tabs.tsx";
import { INITIAL_PHASE, deriveMode, phaseReducer, type BriefSummary } from "./brief-phase.ts";

interface CaseDetailProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly overlay: CaseOverlay | null;
  readonly clientResponded: boolean;
  readonly latestAction: ReviewerAction | null;
  readonly archived: boolean;
}

interface DetailLayoutProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly overlay: CaseOverlay | null;
  readonly disposition: CaseDisposition;
  readonly archived: boolean;
  readonly canRerun: boolean;
  readonly mode: BriefPanelMode;
  readonly onGenerate: () => void;
  readonly onStreamError: () => void;
}

/** Always-visible header above the tabbed body. */
function DetailLayout({
  caseRow,
  brief,
  overlay,
  disposition,
  archived,
  canRerun,
  mode,
  onGenerate,
  onStreamError,
}: DetailLayoutProps): React.JSX.Element {
  return (
    <article className="w-full space-y-8 px-6 py-8">
      <CaseHeader caseRow={caseRow} disposition={disposition} archived={archived} />
      <CaseTabs
        caseRow={caseRow}
        brief={brief}
        overlay={overlay}
        mode={mode}
        canRerun={canRerun}
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
  latestAction,
  archived,
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

  const disposition = deriveCaseDisposition({
    status: caseRow.status,
    latestAction,
    clientResponded,
    submitted: true,
  });

  return (
    <DetailLayout
      caseRow={caseRow}
      brief={brief}
      overlay={overlay}
      disposition={disposition}
      archived={archived}
      canRerun={!isTerminalDisposition(disposition)}
      mode={deriveMode(caseRow.status, brief, phase)}
      onGenerate={() => dispatchPhase({ type: "user-generated" })}
      onStreamError={() => dispatchPhase({ type: "stream-errored" })}
    />
  );
}

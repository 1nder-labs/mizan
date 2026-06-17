/**
 * Case-detail container — composes the header, meta side card, and
 * the right-side brief panel. The panel mode is derived from the
 * server-truth status, the persisted brief, and a local stream-phase
 * machine; no boolean state masquerades as a state machine.
 *
 * Panel modes:
 *   stream (autoStart:true)  — reviewer clicked Generate; POSTs /brief
 *   stream (autoStart:false) — case is RUNNING/QUEUED; resume-GET
 *                              reconnects to the durable-buffer stream
 *   action   — SUSPENDED_HITL awaiting reviewer input
 *   summary  — terminal status with a non-null brief payload
 *   empty    — every other state
 *
 * The autoStart gate prevents spurious POSTs on URL-paste or reload:
 * an already-running case mounts BriefStream with autoStart=false so
 * only the resume-GET fires, not a second workflow POST.
 */
import { useEffect, useReducer } from "react";
import {
  ACTIVE_CASE_STATUSES,
  briefRerunAffordance,
  HITL_SUSPENDED_STATUS,
  type BriefRerunAffordance,
  type CaseDisposition,
  type CaseOverlay,
  type CaseRow,
} from "@mizan/shared";
import { useWorkflowTapeInvalidation } from "@/components/brief/use-workflow-tape-invalidation.ts";
import { useCaseDetailLiveEvents } from "@/hooks/use-case-detail-live-events.ts";
import { useNavigate } from "@tanstack/react-router";
import { CaseTabEnum } from "@mizan/shared";
import { CaseHeader } from "./header.tsx";
import { CaseTabs, type BriefPanelMode } from "./case-tabs.tsx";
import { RerunBar } from "./brief-history.tsx";
import { COPY } from "@/lib/copy-constants.ts";
import { INITIAL_PHASE, deriveMode, phaseReducer, type BriefSummary } from "./brief-phase.ts";

interface CaseDetailProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly overlay: CaseOverlay | null;
  readonly archived: boolean;
}

interface DetailLayoutProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly overlay: CaseOverlay | null;
  readonly disposition: CaseDisposition;
  readonly archived: boolean;
  readonly rerunAffordance: BriefRerunAffordance;
  readonly mode: BriefPanelMode;
  readonly autoStart: boolean;
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
  rerunAffordance,
  mode,
  autoStart,
  onGenerate,
  onStreamError,
}: DetailLayoutProps): React.JSX.Element {
  const navigate = useNavigate();
  /** Top re-trigger: jump to the Brief tab so the re-run's progress is visible. */
  function handleClientRepliedRerun(): void {
    void navigate({ to: ".", search: (prev) => ({ ...prev, tab: CaseTabEnum.enum.brief }) });
    onGenerate();
  }
  return (
    <article className="w-full space-y-8 px-6 py-8">
      <CaseHeader caseRow={caseRow} disposition={disposition} archived={archived} />
      {rerunAffordance === "promoted-bar" && mode === "summary" ? (
        <RerunBar onGenerate={handleClientRepliedRerun} hint={COPY.caseBrief.clientRepliedHint} />
      ) : null}
      <CaseTabs
        caseRow={caseRow}
        brief={brief}
        overlay={overlay}
        mode={mode}
        autoStart={autoStart}
        canRerun={rerunAffordance === "in-tab"}
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

  const disposition = caseRow.disposition;
  const { mode, autoStart } = deriveMode(caseRow.status, brief, phase);

  return (
    <DetailLayout
      caseRow={caseRow}
      brief={brief}
      overlay={overlay}
      disposition={disposition}
      archived={archived}
      rerunAffordance={briefRerunAffordance(disposition)}
      mode={mode}
      autoStart={autoStart}
      onGenerate={() => dispatchPhase({ type: "user-generated" })}
      onStreamError={() => dispatchPhase({ type: "stream-errored" })}
    />
  );
}

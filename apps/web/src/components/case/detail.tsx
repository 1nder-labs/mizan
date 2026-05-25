/**
 * Case-detail container — composes the header, meta side card, and
 * the right-side brief panel. The panel mode is derived from the
 * server-truth status, the persisted brief, and a local stream-phase
 * machine; no boolean state masquerades as a state machine.
 *
 * Panel modes:
 *   stream  — RUNNING from the server OR user just clicked Generate
 *             and the local stream has not yet errored
 *   action  — SUSPENDED_HITL awaiting reviewer input
 *   summary — terminal status with a non-null brief payload
 *   empty   — every other state
 */
import { useEffect, useReducer } from "react";
import {
  HITL_SUSPENDED_STATUS,
  TERMINAL_CASE_STATUSES,
  type CaseDetailResponse,
  type CaseRow,
  type CaseStatus,
} from "@mizan/shared";
import { BriefStream } from "@/components/brief/stream.tsx";
import { useWorkflowTapeInvalidation } from "@/components/brief/use-workflow-events.ts";
import { ActionPanel } from "@/components/case/action-panel.tsx";
import { BriefDetailTabs } from "./brief-details.tsx";
import { BriefEmptyState } from "./brief-empty.tsx";
import { BriefSummaryCard } from "./brief-summary.tsx";
import { CaseDocList } from "./doc-list.tsx";
import { CaseHeader } from "./header.tsx";
import { CaseMetaCard } from "./meta-card.tsx";

type BriefSummary = CaseDetailResponse["brief"];
type BriefPanelMode = "stream" | "action" | "summary" | "empty";

interface CaseDetailProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
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
  const wantStream = status === "RUNNING" || phase.userTriggered;
  if (wantStream && !phase.streamErrored) return "stream";
  if (brief && SHOW_PERSISTED_STATUSES.has(status)) return "summary";
  return "empty";
}

interface BriefPanelProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly mode: BriefPanelMode;
  readonly onGenerate: () => void;
  readonly onStreamError: () => void;
}

function BriefPanel({
  caseRow,
  brief,
  mode,
  onGenerate,
  onStreamError,
}: BriefPanelProps): React.JSX.Element {
  if (mode === "stream") {
    return <BriefStream caseId={caseRow.id} onStreamError={onStreamError} />;
  }
  if (mode === "action") {
    return <ActionPanel detail={{ case: caseRow, brief }} />;
  }
  if (mode === "summary" && brief) {
    return (
      <div className="space-y-4">
        <BriefSummaryCard payload={brief.payload_json} composedAt={brief.composed_at} />
        <BriefDetailTabs payload={brief.payload_json} />
      </div>
    );
  }
  return <BriefEmptyState status={caseRow.status} onGenerate={onGenerate} />;
}

export function CaseDetail({ caseRow, brief }: CaseDetailProps): React.JSX.Element {
  const [phase, dispatchPhase] = useReducer(phaseReducer, INITIAL_PHASE);
  /**
   * Only enable the workflow_events tape during SUSPENDED_HITL — Mode A
   * (BriefStream) already covers the RUNNING phase, and double-opening
   * both streams causes redundant invalidations + last-writer-wins
   * races when each closes on its own terminal event.
   */
  useWorkflowTapeInvalidation(caseRow.id, caseRow.status === HITL_SUSPENDED_STATUS);

  useEffect(() => {
    dispatchPhase({ type: "case-changed" });
  }, [caseRow.id]);
  useEffect(() => {
    dispatchPhase({ type: "status-changed", status: caseRow.status });
  }, [caseRow.status]);

  const mode = deriveMode(caseRow.status, brief, phase);

  return (
    <article className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <CaseHeader caseRow={caseRow} />
      <section className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <CaseMetaCard caseRow={caseRow} />
          <CaseDocList caseId={caseRow.id} />
        </aside>
        <BriefPanel
          caseRow={caseRow}
          brief={brief}
          mode={mode}
          onGenerate={() => dispatchPhase({ type: "user-generated" })}
          onStreamError={() => dispatchPhase({ type: "stream-errored" })}
        />
      </section>
    </article>
  );
}

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
import { BriefStream } from "@/components/brief/stream.tsx";
import { useWorkflowTapeInvalidation } from "@/components/brief/use-workflow-tape-invalidation.ts";
import { useCaseDetailLiveEvents } from "@/hooks/use-case-detail-live-events.ts";
import { ActionPanel } from "@/components/case/action-panel.tsx";
import { BriefDetailTabs } from "./brief-details.tsx";
import { BriefEmptyState } from "./brief-empty.tsx";
import { BriefInflight } from "./brief-inflight.tsx";
import { BriefSummaryCard } from "./brief-summary.tsx";
import { DocumentsPanel } from "./documents-panel.tsx";
import { CaseHeader } from "./header.tsx";
import { CaseMetaCard } from "./meta-card.tsx";
import { SignalExpansionPanel } from "./signal-expansion-panel.tsx";
import { StoryPanel } from "./story-panel.tsx";
import { type CaseOverlay } from "@mizan/shared";

type BriefSummary = CaseDetailResponse["brief"];
type BriefPanelMode = "stream" | "inflight" | "action" | "summary" | "empty";

interface CaseDetailProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly overlay: CaseOverlay | null;
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

interface BriefPanelProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly overlay: CaseOverlay | null;
  readonly mode: BriefPanelMode;
  readonly onGenerate: () => void;
  readonly onStreamError: () => void;
}

function BriefPanel({
  caseRow,
  brief,
  overlay,
  mode,
  onGenerate,
  onStreamError,
}: BriefPanelProps): React.JSX.Element {
  if (mode === "stream") return <BriefStream caseId={caseRow.id} onStreamError={onStreamError} />;
  if (mode === "inflight") return <BriefInflight status={caseRow.status} />;
  if (mode === "action") return <ActionPanel detail={{ case: caseRow, brief, overlay }} />;
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

export function CaseDetail({ caseRow, brief, overlay }: CaseDetailProps): React.JSX.Element {
  const [phase, dispatchPhase] = useReducer(phaseReducer, INITIAL_PHASE);
  /**
   * Tape enabled on any active state (RUNNING, QUEUED, SUSPENDED_HITL) so a
   * passive `inflight` panel will see `workflow.finish` and trigger a
   * case-detail refetch. The tape never POSTs — it's a GET SSE that's
   * safe to mount on every render of an active case.
   */
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

  const mode = deriveMode(caseRow.status, brief, phase);

  /**
   * Detail layout (top to bottom on >= 768px, stacked on narrow):
   *   StoryPanel · DocumentsPanel + MetaCard (aside) · BriefPanel · SignalExpansionPanel
   */
  return (
    <article className="w-full space-y-8 px-6 py-8">
      <CaseHeader caseRow={caseRow} />
      <StoryPanel overlay={overlay} />
      <section className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <CaseMetaCard caseRow={caseRow} />
          <DocumentsPanel caseId={caseRow.id} hasOverlay={overlay !== null} />
        </aside>
        <div className="space-y-6">
          <BriefPanel
            caseRow={caseRow}
            brief={brief}
            overlay={overlay}
            mode={mode}
            onGenerate={() => dispatchPhase({ type: "user-generated" })}
            onStreamError={() => dispatchPhase({ type: "stream-errored" })}
          />
          <SignalExpansionPanel caseId={caseRow.id} />
        </div>
      </section>
    </article>
  );
}

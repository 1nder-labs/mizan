/**
 * Case-detail container — composes the header, meta side card, and
 * the right-side brief panel. The panel mode is derived from the
 * server-truth status, the persisted brief, and a local stream-phase
 * machine; no boolean state masquerades as a state machine.
 *
 * Panel modes:
 *   stream  — RUNNING from the server OR user just clicked Generate
 *             and the local stream has not yet errored
 *   summary — terminal status with a non-null brief payload
 *   empty   — every other state (DRAFT / QUEUED / SUSPENDED_HITL /
 *             FAILED / terminal-with-null-brief / RUNNING-with-failed-stream)
 *
 * Single-POST architecture: `<BriefStream>` is the only component that
 * POSTs to the worker SSE endpoint. Mounting it fires `sendMessage`
 * once on mount → worker flips DRAFT → RUNNING and emits workflow
 * events. No duplicate POSTs, no producer-guard races.
 *
 * RUNNING + SSE failure recovery: when the local stream errors while
 * the server status is still RUNNING (transport died, 5xx mid-flight),
 * the derived mode flips to `empty` so the reviewer gets a retry CTA
 * instead of a frozen stream view they can't escape. Clicking
 * `Generate` clears the error flag and re-mounts the stream.
 */
import { useEffect, useReducer } from "react";
import type { CaseDetailResponse, CaseRow, CaseStatus } from "@mizan/shared";
import { BriefStream } from "@/components/brief/stream.tsx";
import { BriefDetailTabs } from "./brief-details.tsx";
import { BriefEmptyState } from "./brief-empty.tsx";
import { BriefSummaryCard } from "./brief-summary.tsx";
import { CaseDocList } from "./doc-list.tsx";
import { CaseHeader } from "./header.tsx";
import { CaseMetaCard } from "./meta-card.tsx";

type BriefSummary = CaseDetailResponse["brief"];
type BriefPanelMode = "stream" | "summary" | "empty";

interface CaseDetailProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
}

const SHOW_PERSISTED_STATUSES: ReadonlySet<CaseStatus> = new Set(["READY_FOR_REVIEW", "ACTIONED"]);
const TERMINAL_STATUSES: ReadonlySet<CaseStatus> = new Set([
  "READY_FOR_REVIEW",
  "ACTIONED",
  "FAILED",
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
      return TERMINAL_STATUSES.has(event.status) ? INITIAL_PHASE : state;
    case "user-generated":
      return { userTriggered: true, streamErrored: false };
    case "stream-errored":
      return { ...state, streamErrored: true };
  }
}

function deriveMode(
  status: CaseStatus,
  brief: BriefSummary,
  phase: StreamPhase,
): BriefPanelMode {
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

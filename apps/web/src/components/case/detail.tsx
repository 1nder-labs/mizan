/**
 * Case-detail container — composes the header, meta side card, and
 * the right-side brief panel. The brief panel routes by case status:
 *   RUNNING                              -> <BriefStream> (workflow consumer)
 *   READY_FOR_REVIEW / ACTIONED + brief  -> persisted summary + tabs
 *   user clicked Generate brief          -> <BriefStream> (triggers + consumes)
 *   anything else                        -> empty / failure card
 *
 * Single-POST architecture: `<BriefStream>` is the only component
 * that POSTs to the worker SSE endpoint. A user-triggered render
 * mounts the same stream component, which fires its `sendMessage`
 * once on mount → the worker flips DRAFT → RUNNING and emits the
 * workflow events. No duplicate POSTs, no producer-guard races.
 *
 * Lifecycle of `userTriggered`:
 *   - resets on caseId change so a click on case A does not bleed
 *     into case B when the reviewer navigates between them.
 *   - resets when status enters a terminal state (READY_FOR_REVIEW /
 *     ACTIONED / FAILED) so FAILED retry shows the empty-state retry
 *     button instead of staying stuck inside the stream view.
 *   - resets when `<BriefStream>` reports an error via its
 *     `onStreamError` callback (worker rejected the POST before
 *     flipping to RUNNING, or the SSE transport failed). Without
 *     this, status would stay DRAFT and `useStreamOpener`'s ref
 *     would keep the empty-state retry button unreachable.
 */
import { useEffect, useState } from "react";
import type { CaseDetailResponse, CaseRow } from "@mizan/shared";
import { BriefStream } from "@/components/brief/stream.tsx";
import { BriefDetailTabs } from "./brief-details.tsx";
import { BriefEmptyState } from "./brief-empty.tsx";
import { BriefSummaryCard } from "./brief-summary.tsx";
import { CaseDocList } from "./doc-list.tsx";
import { CaseHeader } from "./header.tsx";
import { CaseMetaCard } from "./meta-card.tsx";

type BriefSummary = CaseDetailResponse["brief"];

interface CaseDetailProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
}

const SHOW_PERSISTED_STATUSES = new Set(["READY_FOR_REVIEW", "ACTIONED"]);

interface BriefPanelProps extends CaseDetailProps {
  readonly userTriggered: boolean;
  readonly onGenerate: () => void;
}

function BriefPanel({
  caseRow,
  brief,
  userTriggered,
  onGenerate,
  onStreamError,
}: BriefPanelProps & { readonly onStreamError: () => void }): React.JSX.Element {
  if (caseRow.status === "RUNNING" || userTriggered) {
    return <BriefStream caseId={caseRow.id} onStreamError={onStreamError} />;
  }
  if (brief && SHOW_PERSISTED_STATUSES.has(caseRow.status)) {
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
  const [userTriggered, setUserTriggered] = useState(false);
  useEffect(() => {
    setUserTriggered(false);
  }, [caseRow.id]);
  useEffect(() => {
    if (SHOW_PERSISTED_STATUSES.has(caseRow.status) || caseRow.status === "FAILED") {
      setUserTriggered(false);
    }
  }, [caseRow.status]);

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
          userTriggered={userTriggered}
          onGenerate={() => setUserTriggered(true)}
          onStreamError={() => setUserTriggered(false)}
        />
      </section>
    </article>
  );
}

/**
 * Case-detail container — composes the header, meta side card, and
 * the right-side brief panel. The brief panel routes by case status:
 *   RUNNING                              -> <BriefStream> (U10)
 *   READY_FOR_REVIEW / ACTIONED + brief  -> persisted summary + tabs
 *   anything else                        -> empty / failure card
 *
 * Takes the shared `CaseDetailResponse["brief"]` directly — no
 * web-only `CaseDetail` wrapper type. Component reaches into
 * `brief.payload_json` for the rich brief body.
 */
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

function BriefPanel({ caseRow, brief }: CaseDetailProps): React.JSX.Element {
  if (caseRow.status === "RUNNING") {
    return <BriefStream caseId={caseRow.id} />;
  }
  if (brief) {
    return (
      <div className="space-y-4">
        <BriefSummaryCard payload={brief.payload_json} composedAt={brief.composed_at} />
        <BriefDetailTabs payload={brief.payload_json} />
      </div>
    );
  }
  return <BriefEmptyState status={caseRow.status} />;
}

export function CaseDetail({ caseRow, brief }: CaseDetailProps): React.JSX.Element {
  return (
    <article className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <CaseHeader caseRow={caseRow} />
      <section className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <CaseMetaCard caseRow={caseRow} />
          <CaseDocList caseId={caseRow.id} />
        </aside>
        <BriefPanel caseRow={caseRow} brief={brief} />
      </section>
    </article>
  );
}

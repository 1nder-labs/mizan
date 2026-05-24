/**
 * Case-detail container — composes the header, meta side card, and
 * the right-side brief panel. The brief panel routes by case status:
 *   RUNNING                              -> <BriefStream> (U10)
 *   READY_FOR_REVIEW / ACTIONED + brief  -> persisted summary + tabs
 *   anything else                        -> empty / failure card
 */
import type { BriefPayload, CaseRow } from "@mizan/shared";
import { BriefStream } from "@/components/brief/stream.tsx";
import { BriefDetailTabs } from "./brief-details.tsx";
import { BriefEmptyState } from "./brief-empty.tsx";
import { BriefSummaryCard } from "./brief-summary.tsx";
import { CaseHeader } from "./header.tsx";
import { CaseMetaCard } from "./meta-card.tsx";

interface CaseDetailProps {
  readonly caseRow: CaseRow;
  readonly briefPayload: BriefPayload | null;
  readonly briefComposedAt: number | null;
}

function BriefPanel({
  caseRow,
  briefPayload,
  briefComposedAt,
}: CaseDetailProps): React.JSX.Element {
  if (caseRow.status === "RUNNING") {
    return <BriefStream caseId={caseRow.id} />;
  }
  if (briefPayload && briefComposedAt) {
    return (
      <div className="space-y-4">
        <BriefSummaryCard payload={briefPayload} composedAt={briefComposedAt} />
        <BriefDetailTabs payload={briefPayload} />
      </div>
    );
  }
  return <BriefEmptyState status={caseRow.status} />;
}

export function CaseDetail({
  caseRow,
  briefPayload,
  briefComposedAt,
}: CaseDetailProps): React.JSX.Element {
  return (
    <article className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <CaseHeader caseRow={caseRow} />
      <section className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <CaseMetaCard caseRow={caseRow} />
        </aside>
        <BriefPanel
          caseRow={caseRow}
          briefPayload={briefPayload}
          briefComposedAt={briefComposedAt}
        />
      </section>
    </article>
  );
}

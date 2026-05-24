/**
 * Case meta card — category, geography, claimed Zakat category,
 * created + updated timestamps. Read-only side panel that sits next
 * to the brief on wide viewports. `current_run_id` is intentionally
 * omitted from the wire response (internal column, narrow projection
 * in `apps/worker/src/routes/cases-list.ts`); when a future plan
 * requires surfacing it for resumability UX, add it to
 * `CaseRowSchema` + `caseListProjection()` first.
 */
import type { CaseRow } from "@mizan/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

interface CaseMetaCardProps {
  readonly caseRow: CaseRow;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function MetaRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/70 py-2 last:border-b-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground tabular text-right">{value}</span>
    </div>
  );
}

export function CaseMetaCard({ caseRow }: CaseMetaCardProps): React.JSX.Element {
  return (
    <Card className="border-border/80 shadow-elev-1">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Case meta</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <MetaRow label="Category" value={<span className="capitalize">{caseRow.category}</span>} />
        <MetaRow label="Geography" value={caseRow.geography} />
        <MetaRow label="Zakat" value={caseRow.claimed_zakat_category ?? "—"} />
        <MetaRow label="Created" value={dateFormatter.format(new Date(caseRow.created_at))} />
        <MetaRow label="Updated" value={dateFormatter.format(new Date(caseRow.updated_at))} />
      </CardContent>
    </Card>
  );
}

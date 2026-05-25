/**
 * Case-detail header card. Carries the id (short + monospace), status
 * badge, category, geography, and the back link to /queue.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Clock } from "lucide-react";
import type { CaseRow } from "@mizan/shared";
import { CaseStatusBadge } from "@/components/case-status-badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { formatShortDateTime } from "@/lib/format.ts";

export function CaseHeader({ caseRow }: { readonly caseRow: CaseRow }): React.JSX.Element {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/queue" search={{ page: 1, sort: "updated_desc" }}>
            <ArrowLeft className="mr-1 size-3.5" />
            Back to queue
          </Link>
        </Button>
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Case</span>
            <span className="font-mono text-sm text-foreground tabular">{caseRow.id}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold capitalize tracking-tight">{caseRow.category}</h1>
            <CaseStatusBadge status={caseRow.status} />
          </div>
          <p className="text-sm text-muted-foreground">{caseRow.geography}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        <span className="tabular">Updated {formatShortDateTime(caseRow.updated_at)}</span>
      </div>
    </header>
  );
}

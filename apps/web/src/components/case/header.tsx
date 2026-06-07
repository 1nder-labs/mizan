/**
 * Case-detail header card. Leads with the campaign title, then status badge,
 * category · geography, and the back link to /queue. Optionally renders
 * a "client responded" badge and a "client submitted" badge when those flags
 * are present from the detail query.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Clock } from "lucide-react";
import type { CaseRow } from "@mizan/shared";
import { CaseStatusBadge } from "@/components/case-status-badge.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { formatShortDateTime } from "@/lib/format.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { formatCountry } from "@/lib/display-labels.ts";
import { cn } from "@/lib/utils.ts";
import { CaseAssignment } from "./case-assignment.tsx";

interface CaseHeaderProps {
  readonly caseRow: CaseRow;
  readonly clientResponded?: boolean;
}

function ClientResponseBadge({
  responded,
}: {
  readonly responded: boolean;
}): React.JSX.Element | null {
  if (!responded) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tracking-wide",
        "bg-status-warning text-status-warning-foreground border-status-warning-border",
      )}
    >
      {COPY.reviewerNotes.respondedBadge}
    </Badge>
  );
}

function ClientSubmittedBadge({
  submitted,
}: {
  readonly submitted: boolean;
}): React.JSX.Element | null {
  if (!submitted) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tracking-wide",
        "bg-status-info text-status-info-foreground border-status-info-border",
      )}
    >
      {COPY.reviewerNotes.clientSubmittedBadge}
    </Badge>
  );
}

/** Right-aligned meta column: last-updated stamp + assignment control. */
function CaseHeaderMeta({ caseRow }: { readonly caseRow: CaseRow }): React.JSX.Element {
  return (
    <div className="flex shrink-0 flex-col items-end gap-4">
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Updated
        </span>
        <div className="flex items-center gap-1.5 text-xs text-foreground">
          <Clock className="size-3 text-muted-foreground" />
          <span className="font-numeric tabular">{formatShortDateTime(caseRow.updated_at)}</span>
        </div>
      </div>
      <CaseAssignment caseId={caseRow.id} currentAssignee={caseRow.assigned_to} />
    </div>
  );
}

export function CaseHeader({ caseRow, clientResponded }: CaseHeaderProps): React.JSX.Element {
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border/50 pb-6">
      <div className="min-w-0 space-y-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
        >
          <Link to="/queue" search={{ page: 1, sort: "updated_desc", view: "board" }}>
            <ArrowLeft className="mr-1.5 size-3.5" />
            Back to queue
          </Link>
        </Button>
        <div className="space-y-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Campaign
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-display text-2xl font-semibold leading-tight tracking-[-0.02em]">
              {caseRow.title}
            </h1>
            <CaseStatusBadge status={caseRow.status} />
            <ClientResponseBadge responded={clientResponded ?? false} />
            <ClientSubmittedBadge submitted={caseRow.client_submitted} />
          </div>
          <p className="text-sm capitalize text-muted-foreground">
            {caseRow.category} · {formatCountry(caseRow.geography)}
          </p>
        </div>
      </div>
      <CaseHeaderMeta caseRow={caseRow} />
    </header>
  );
}

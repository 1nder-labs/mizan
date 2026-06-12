/**
 * Case-detail header card. Leads with the campaign title, then the single
 * derived disposition badge, category · geography, and the back link to
 * /queue. The disposition already folds in submitted / responded / terminal
 * state, so the old status + "client responded" + "client submitted" badge
 * trio collapses to one honest chip.
 */
import { Link } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ArrowLeft, Clock } from "lucide-react";
import type { CaseDisposition, CaseRow } from "@mizan/shared";
import { CaseDispositionBadge } from "@/components/case-disposition-badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useArchiveCase } from "@/hooks/use-archive-case.ts";
import { loadQueueSearch } from "@/lib/queue-nav-memory.ts";
import { formatShortDateTime } from "@/lib/format.ts";
import { formatCountry } from "@/lib/display-labels.ts";
import { CaseAssignment } from "./case-assignment.tsx";

interface CaseHeaderProps {
  readonly caseRow: CaseRow;
  readonly disposition: CaseDisposition;
  readonly archived: boolean;
}

/** Archive / restore toggle for the case. */
function ArchiveButton({
  caseId,
  archived,
}: {
  readonly caseId: string;
  readonly archived: boolean;
}): React.JSX.Element {
  const mutation = useArchiveCase(caseId);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(!archived)}
    >
      {archived ? (
        <ArchiveRestore className="mr-1.5 size-3.5" />
      ) : (
        <Archive className="mr-1.5 size-3.5" />
      )}
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}

/** Right-aligned meta column: last-updated stamp + assignment control. */
function CaseHeaderMeta({
  caseRow,
  archived,
}: {
  readonly caseRow: CaseRow;
  readonly archived: boolean;
}): React.JSX.Element {
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
      <ArchiveButton caseId={caseRow.id} archived={archived} />
    </div>
  );
}

export function CaseHeader({ caseRow, disposition, archived }: CaseHeaderProps): React.JSX.Element {
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border/50 pb-6">
      <div className="min-w-0 space-y-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
        >
          <Link to="/queue" search={loadQueueSearch()}>
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
            <CaseDispositionBadge disposition={disposition} />
          </div>
          <p className="text-sm capitalize text-muted-foreground">
            {caseRow.category} · {formatCountry(caseRow.geography)}
          </p>
        </div>
      </div>
      <CaseHeaderMeta caseRow={caseRow} archived={archived} />
    </header>
  );
}

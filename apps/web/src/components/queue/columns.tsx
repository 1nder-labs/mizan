/**
 * Column factory for the queue table. Pure — receives the current
 * search + a setter and returns column defs. Reads `latest_brief` off
 * each row (denorm subquery in the worker) for the recommendation +
 * verification-path columns so the queue surface stays a single
 * round-trip.
 */
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { CaseRow, QueueSearch, QueueSort } from "@mizan/shared";
import { CaseStatusBadge } from "@/components/case-status-badge.tsx";
import { CaseDispositionBadge } from "@/components/case-disposition-badge.tsx";
import { RecommendationBadge } from "@/components/case/recommendation-badge.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { formatCountry, humanVerification } from "@/lib/display-labels.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";

/** Typographic placeholder for a column with no value yet (em dash). */
const EMPTY_CELL = "—";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function nextSort(current: QueueSort): QueueSort {
  if (current === "updated_desc") return "updated_asc";
  if (current === "updated_asc") return "created_desc";
  return "updated_desc";
}

function sortIcon(sort: QueueSort): React.JSX.Element {
  if (sort === "updated_desc") return <ArrowDown className="size-3" />;
  if (sort === "updated_asc") return <ArrowUp className="size-3" />;
  return <ArrowUpDown className="size-3" />;
}

function UpdatedHeader({
  search,
  onSearchChange,
}: {
  readonly search: QueueSearch;
  readonly onSearchChange: (next: Partial<QueueSearch>) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => onSearchChange({ sort: nextSort(search.sort) })}
    >
      Updated
      {sortIcon(search.sort)}
    </button>
  );
}

const idColumn: ColumnDef<CaseRow> = {
  id: "id",
  header: "Case",
  cell: ({ row }) => (
    <div className="flex items-center gap-2">
      <span className="text-[15px] font-medium text-foreground">{row.original.title}</span>
      {row.original.client_submitted ? (
        <Badge
          variant="outline"
          className={cn(
            "rounded-full px-1.5 py-0 text-[10px] font-medium leading-none tracking-wide",
            "bg-status-info text-status-info-foreground border-status-info-border",
          )}
        >
          {COPY.reviewerNotes.clientSubmittedShort}
        </Badge>
      ) : null}
    </div>
  ),
};

const categoryColumn: ColumnDef<CaseRow> = {
  id: "category",
  header: "Category",
  cell: ({ row }) => <span className="text-sm capitalize">{row.original.category}</span>,
};

const geographyColumn: ColumnDef<CaseRow> = {
  id: "geography",
  header: "Geography",
  cell: ({ row }) => (
    <span className="text-sm text-muted-foreground">{formatCountry(row.original.geography)}</span>
  ),
};

const statusColumn: ColumnDef<CaseRow> = {
  id: "status",
  header: "Status",
  cell: ({ row }) => <CaseStatusBadge status={row.original.status} />,
};

const recommendationColumn: ColumnDef<CaseRow> = {
  id: "recommendation",
  header: "Recommendation",
  cell: ({ row }) =>
    row.original.latest_brief ? (
      <RecommendationBadge recommendation={row.original.latest_brief.recommendation} />
    ) : (
      <span className="text-xs text-muted-foreground">{EMPTY_CELL}</span>
    ),
};

const outcomeColumn: ColumnDef<CaseRow> = {
  id: "outcome",
  header: "Outcome",
  cell: ({ row }) =>
    row.original.latest_action ? (
      <CaseDispositionBadge disposition={row.original.disposition} />
    ) : (
      <span className="text-xs text-muted-foreground">{EMPTY_CELL}</span>
    ),
};

const verificationColumn: ColumnDef<CaseRow> = {
  id: "verification_path",
  header: "Verification",
  cell: ({ row }) =>
    row.original.latest_brief ? (
      <span className="text-xs capitalize text-muted-foreground">
        {humanVerification(row.original.latest_brief.verification_path)}
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">{EMPTY_CELL}</span>
    ),
};

function staticColumns(): ColumnDef<CaseRow>[] {
  return [
    idColumn,
    categoryColumn,
    geographyColumn,
    statusColumn,
    recommendationColumn,
    outcomeColumn,
    verificationColumn,
  ];
}

export function buildColumns(
  search: QueueSearch,
  onSearchChange: (next: Partial<QueueSearch>) => void,
): ColumnDef<CaseRow>[] {
  return [
    ...staticColumns(),
    {
      id: "updated",
      header: () => <UpdatedHeader search={search} onSearchChange={onSearchChange} />,
      cell: ({ row }) => (
        <span className="font-numeric text-xs text-muted-foreground tabular">
          {dateFormatter.format(new Date(row.original.updated_at))}
        </span>
      ),
    },
  ];
}

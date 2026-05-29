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
import { RecommendationBadge } from "@/components/case/recommendation-badge.tsx";
import { humanVerification } from "@/lib/display-labels.ts";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function shortId(id: string): string {
  return id.slice(0, 8);
}

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
    <span className="font-mono text-xs text-foreground tabular">{shortId(row.original.id)}</span>
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
    <span className="text-sm text-muted-foreground">{row.original.geography}</span>
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
      <span className="text-xs text-muted-foreground">-</span>
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
      <span className="text-xs text-muted-foreground">-</span>
    ),
};

function staticColumns(): ColumnDef<CaseRow>[] {
  return [
    idColumn,
    categoryColumn,
    geographyColumn,
    statusColumn,
    recommendationColumn,
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
        <span className="text-xs text-muted-foreground tabular">
          {dateFormatter.format(new Date(row.original.updated_at))}
        </span>
      ),
    },
  ];
}

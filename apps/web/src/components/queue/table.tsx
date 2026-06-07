/**
 * Reviewer queue table. Composes columns + header + body helpers.
 * Empty-state lives in `empty.tsx`; columns in `columns.tsx`.
 */
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Table as RTable,
} from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import type { CaseRow, QueueSearch } from "@mizan/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { buildColumns } from "./columns.tsx";
import { QueueEmptyState } from "./empty.tsx";

interface QueueTableProps {
  readonly rows: readonly CaseRow[];
  readonly search: QueueSearch;
  readonly onSearchChange: (next: Partial<QueueSearch>) => void;
}

function QueueTableHeader({ table }: { readonly table: RTable<CaseRow> }): React.JSX.Element {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((group) => (
        <TableRow key={group.id} className="hover:bg-transparent">
          {group.headers.map((header) => (
            <TableHead
              key={header.id}
              className="bg-muted/30 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {header.isPlaceholder
                ? null
                : flexRender(header.column.columnDef.header, header.getContext())}
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );
}

function QueueTableBody({
  table,
  onRowClick,
}: {
  readonly table: RTable<CaseRow>;
  readonly onRowClick: (caseId: string) => void;
}): React.JSX.Element {
  return (
    <TableBody>
      {table.getRowModel().rows.map((row) => (
        <TableRow
          key={row.id}
          className="cursor-pointer transition-colors hover:bg-muted/40"
          onClick={() => onRowClick(row.original.id)}
        >
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id} className="py-3">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

export function QueueTable({ rows, search, onSearchChange }: QueueTableProps): React.JSX.Element {
  const navigate = useNavigate();
  const columns = useMemo(() => buildColumns(search, onSearchChange), [search, onSearchChange]);
  const data = useMemo(() => rows.slice(), [rows]);
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (rows.length === 0) {
    return (
      <QueueEmptyState
        onClearFilters={() =>
          onSearchChange({
            status: undefined,
            category: undefined,
            geography: undefined,
            page: 1,
          })
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elev-1">
      <Table>
        <QueueTableHeader table={table} />
        <QueueTableBody
          table={table}
          onRowClick={(caseId) => {
            void navigate({ to: "/case/$caseId", params: { caseId } });
          }}
        />
      </Table>
    </div>
  );
}

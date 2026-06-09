/**
 * Audit list table body — row click navigates to case detail.
 */
import { useNavigate } from "@tanstack/react-router";
import type { AuditEntry } from "@mizan/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { formatMediumDateTime } from "@/lib/format.ts";

interface AuditEntriesTableProps {
  readonly entries: readonly AuditEntry[];
}

export function AuditEntriesTable({ entries }: AuditEntriesTableProps): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50 bg-muted/30">
          <TableHead className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Case
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Reviewer
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Action
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Rationale
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Acted at
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow
            key={entry.id}
            className="cursor-pointer border-border/40 transition-colors hover:bg-muted/40"
            onClick={() =>
              void navigate({ to: "/case/$caseId", params: { caseId: entry.case_id } })
            }
          >
            <TableCell className="font-mono text-xs font-numeric text-muted-foreground">
              {entry.case_id.slice(0, 8)}…
            </TableCell>
            <TableCell className="text-sm">{entry.reviewer_email ?? "—"}</TableCell>
            <TableCell className="text-sm font-medium">{entry.action}</TableCell>
            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
              {entry.rationale}
            </TableCell>
            <TableCell className="font-mono text-xs font-numeric tabular text-muted-foreground">
              {formatMediumDateTime(entry.acted_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

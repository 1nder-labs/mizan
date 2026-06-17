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
import { interactiveRowProps } from "@/lib/interactive-row.ts";
import { formatMediumDateTime } from "@/lib/format.ts";

interface AuditEntriesTableProps {
  readonly entries: readonly AuditEntry[];
}

const HEAD_CLASS = "text-[10px] uppercase tracking-[0.18em] text-muted-foreground";

function AuditTableHeader(): React.JSX.Element {
  return (
    <TableHeader>
      <TableRow className="border-border/50 bg-muted/30">
        <TableHead className={HEAD_CLASS}>Case</TableHead>
        <TableHead className={HEAD_CLASS}>Reviewer</TableHead>
        <TableHead className={HEAD_CLASS}>Action</TableHead>
        <TableHead className={HEAD_CLASS}>Rationale</TableHead>
        <TableHead className={HEAD_CLASS}>Acted at</TableHead>
      </TableRow>
    </TableHeader>
  );
}

export function AuditEntriesTable({ entries }: AuditEntriesTableProps): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <Table>
      <AuditTableHeader />
      <TableBody>
        {entries.map((entry) => (
          <TableRow
            key={entry.id}
            className="cursor-pointer border-border/40 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            {...interactiveRowProps(
              () => void navigate({ to: "/case/$caseId", params: { caseId: entry.case_id } }),
              `Open case ${entry.case_id.slice(0, 8)}`,
            )}
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

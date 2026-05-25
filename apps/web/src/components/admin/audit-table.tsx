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
        <TableRow>
          <TableHead>Case</TableHead>
          <TableHead>Reviewer</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Rationale</TableHead>
          <TableHead>Acted at</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow
            key={entry.id}
            className="cursor-pointer hover:bg-muted/40"
            onClick={() => void navigate({ to: "/case/$caseId", params: { caseId: entry.case_id } })}
          >
            <TableCell className="font-mono text-xs">{entry.case_id.slice(0, 8)}…</TableCell>
            <TableCell>{entry.reviewer_email ?? "—"}</TableCell>
            <TableCell>{entry.action}</TableCell>
            <TableCell className="max-w-xs truncate">{entry.rationale}</TableCell>
            <TableCell>{formatMediumDateTime(entry.acted_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

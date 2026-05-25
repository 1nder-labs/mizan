/**
 * Admin audit table — paginated reviewer-action feed.
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { auditListQueryOptions } from "@/lib/audit-api.ts";
import { AuditEntriesTable } from "./audit-table.tsx";
import { AuditPagination } from "./audit-pagination.tsx";

const auditRoute = getRouteApi("/admin/audit");

export function AuditList(): React.JSX.Element {
  const search = auditRoute.useSearch();
  const { data, isPending } = useQuery(auditListQueryOptions(search));

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading audit entries…</p>;
  }

  if (!data || data.entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No reviewer actions recorded yet.</p>;
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="space-y-4">
      <AuditEntriesTable entries={data.entries} />
      <AuditPagination search={search} totalPages={totalPages} />
    </div>
  );
}

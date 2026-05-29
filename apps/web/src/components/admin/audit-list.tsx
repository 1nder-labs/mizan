/**
 * Admin audit table — paginated reviewer-action feed.
 *
 * Error handling stays inline (card-level), not at the route boundary,
 * so a transient `/api/admin/audit` 500 surfaces as a retry-able card
 * + toast — the rest of the page (header, nav, sign-out) keeps
 * rendering instead of swapping to a full "Something went wrong!"
 * screen.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { auditListQueryOptions } from "@/lib/audit-api.ts";
import { useLiveEvents } from "@/hooks/use-live-events.ts";
import { useViewerTopics } from "@/hooks/use-viewer-topics.ts";
import { Button } from "@/components/ui/button.tsx";
import { AuditEntriesTable } from "./audit-table.tsx";
import { AuditPagination } from "./audit-pagination.tsx";

const auditRoute = getRouteApi("/admin/audit");

interface AuditErrorCardProps {
  readonly onRetry: () => void;
  readonly isFetching: boolean;
}

function AuditErrorCard({ onRetry, isFetching }: AuditErrorCardProps): React.JSX.Element {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="text-destructive">Could not load reviewer actions.</p>
      <p className="mt-1 text-muted-foreground">
        The audit feed temporarily failed to load - retry below.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={isFetching} className="mt-3">
        <RefreshCw className={isFetching ? "size-3 animate-spin" : "size-3"} />
        Retry
      </Button>
    </div>
  );
}

export function AuditList(): React.JSX.Element {
  const search = auditRoute.useSearch();
  const { orgId } = useViewerTopics();
  useLiveEvents(orgId ? `org:${orgId}` : "", { enabled: Boolean(orgId) });
  const { data, isPending, isError, error, refetch, isFetching } = useQuery(
    auditListQueryOptions(search),
  );

  useEffect(() => {
    if (isError) {
      const message = error instanceof Error ? error.message : "Audit log failed to load";
      toast.error(message);
    }
  }, [isError, error]);

  if (isError) return <AuditErrorCard onRetry={() => void refetch()} isFetching={isFetching} />;

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

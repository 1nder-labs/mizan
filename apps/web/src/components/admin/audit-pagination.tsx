/**
 * Pagination controls for the admin audit list.
 */
import { useNavigate } from "@tanstack/react-router";
import type { AuditListSearch } from "@mizan/shared";
import { Button } from "@/components/ui/button.tsx";

interface AuditPaginationProps {
  readonly search: AuditListSearch;
  readonly totalPages: number;
}

export function AuditPagination({ search, totalPages }: AuditPaginationProps): React.JSX.Element {
  const navigate = useNavigate({ from: "/admin/audit" });

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={search.page <= 1}
        onClick={() => void navigate({ search: { page: search.page - 1 } })}
      >
        Previous
      </Button>
      <span className="tabular text-xs text-muted-foreground">
        Page {search.page} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={search.page >= totalPages}
        onClick={() => void navigate({ search: { page: search.page + 1 } })}
      >
        Next
      </Button>
    </div>
  );
}

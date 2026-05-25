/**
 * Queue page. Renders the reviewer case list driven by URL search
 * params. Consumes query data prefetched by the `/queue` route loader.
 * Shell + header + sign-out wiring live in `<AuthenticatedShell>`.
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { type QueueSearch } from "@mizan/shared";
import { casesListQueryOptions } from "@/lib/cases-api.ts";
import { QueueFilterBar } from "@/components/queue/filter-bar.tsx";
import { QueueSkeleton } from "@/components/queue/skeleton.tsx";
import { QueueTable } from "@/components/queue/table.tsx";
import { QueueSummary } from "@/components/queue/queue-summary.tsx";
import { QueueError } from "@/components/queue/queue-error.tsx";
import { QueueFooter } from "@/components/queue/queue-footer.tsx";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell.tsx";

const queueApi = getRouteApi("/queue");

export function QueuePage(): React.JSX.Element {
  const search = queueApi.useSearch();
  const navigate = useNavigate({ from: "/queue" });
  const query = useQuery(casesListQueryOptions(search));

  function setSearch(next: Partial<QueueSearch>): void {
    void navigate({ search: (prev) => ({ ...prev, ...next, page: next.page ?? 1 }) });
  }

  return (
    <AuthenticatedShell context="Reviewer queue">
      <section className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <QueueSummary
          isPending={query.isPending}
          showing={query.data?.cases.length ?? 0}
          total={query.data?.total ?? 0}
          sort={search.sort}
        />
        <QueueFilterBar search={search} onSearchChange={setSearch} />
        {query.error ? (
          <QueueError
            onRetry={() => {
              void query.refetch();
            }}
            retrying={query.isFetching}
          />
        ) : null}
        {query.isPending ? (
          <QueueSkeleton />
        ) : (
          <QueueTable rows={query.data?.cases ?? []} search={search} onSearchChange={setSearch} />
        )}
        <QueueFooter refetching={query.isFetching} />
      </section>
    </AuthenticatedShell>
  );
}

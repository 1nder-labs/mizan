/**
 * Queue page component. Renders the reviewer case list driven by URL
 * search params. Consumes query data prefetched by the `/queue` route
 * loader. Logout invalidates the session entry and the shell's redirect
 * chain returns the user to `/login`.
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { type QueueSearch } from "@mizan/shared";
import { useSignOut } from "@/hooks/use-sign-out.ts";
import { casesListQueryOptions } from "@/lib/cases-api.ts";
import { QueueFilterBar } from "@/components/queue/filter-bar.tsx";
import { QueueHeader } from "@/components/queue/header.tsx";
import { QueueSkeleton } from "@/components/queue/skeleton.tsx";
import { QueueTable } from "@/components/queue/table.tsx";
import { QueueSummary } from "@/components/queue/queue-summary.tsx";
import { QueueError } from "@/components/queue/queue-error.tsx";
import { QueueFooter } from "@/components/queue/queue-footer.tsx";

const queueApi = getRouteApi("/queue");

export function QueuePage(): React.JSX.Element {
  const search = queueApi.useSearch();
  const navigate = useNavigate({ from: "/queue" });
  const query = useQuery(casesListQueryOptions(search));
  const { signOut, signingOut } = useSignOut();

  function setSearch(next: Partial<QueueSearch>): void {
    void navigate({ search: (prev) => ({ ...prev, ...next, page: next.page ?? 1 }) });
  }

  return (
    <main className="min-h-screen bg-background">
      <QueueHeader context="Reviewer queue" onSignOut={signOut} signingOut={signingOut} />
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
    </main>
  );
}

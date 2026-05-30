/**
 * Queue page. Renders the reviewer case list driven by URL search
 * params. Consumes query data prefetched by the `/queue` route loader.
 * Shell + header + sign-out wiring live in `<AuthenticatedShell>`.
 *
 * `?view=board|table` selects the surface: Kanban (default) or the
 * original high-density table. Both surfaces consume the same paged
 * `cases` list.
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
import { KanbanBoard } from "@/components/queue/kanban-board.tsx";
import { ViewToggle } from "@/components/queue/view-toggle.tsx";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell.tsx";
import { useLiveEvents } from "@/hooks/use-live-events.ts";
import { toastLiveEvent } from "@/hooks/use-live-events-toasts.ts";
import { useViewerTopics } from "@/hooks/use-viewer-topics.ts";

const queueApi = getRouteApi("/queue");

/**
 * Org topic keeps the board cache fresh; user topic additionally toasts on
 * assignment. `replayGraceMs` suppresses toasts for the catch-up replay the
 * SSE stream sends on connect, so only live assignments notify.
 */
function useQueueLiveEvents(orgId: string | undefined, userId: string | undefined): void {
  useLiveEvents(orgId ? `org:${orgId}` : "", { enabled: Boolean(orgId) });
  useLiveEvents(userId ? `user:${userId}` : "", {
    enabled: Boolean(userId),
    onEvent: toastLiveEvent,
    replayGraceMs: 2_500,
  });
}

export function QueuePage(): React.JSX.Element {
  const search = queueApi.useSearch();
  const navigate = useNavigate({ from: "/queue" });
  const query = useQuery(casesListQueryOptions(search));
  const { orgId, userId } = useViewerTopics();
  useQueueLiveEvents(orgId, userId);

  function setSearch(next: Partial<QueueSearch>): void {
    void navigate({ search: (prev) => ({ ...prev, ...next, page: next.page ?? 1 }) });
  }

  const rows = query.data?.cases ?? [];

  return (
    <AuthenticatedShell context="Reviewer queue">
      <section className="w-full space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <QueueSummary
            isPending={query.isPending}
            showing={rows.length}
            total={query.data?.total ?? 0}
            sort={search.sort}
          />
          <ViewToggle current={search.view} />
        </div>
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
        ) : search.view === "board" ? (
          <KanbanBoard rows={rows} search={search} />
        ) : (
          <QueueTable rows={rows} search={search} onSearchChange={setSearch} />
        )}
        <QueueFooter refetching={query.isFetching} />
      </section>
    </AuthenticatedShell>
  );
}

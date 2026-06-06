import type { LiveEventRow } from "@mizan/shared";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys.ts";

/**
 * Window over which invalidations are coalesced. On (re)connect the SSE stream
 * replays the topic's full history as a rapid burst; without coalescing, each
 * replayed row fires its own `invalidateQueries({ refetchType: "all" })`, so an
 * org topic with N historical rows triggers N refetches of the case detail +
 * queue list on a single page load. Collecting distinct keys over a short
 * window collapses the burst to one refetch per key while still catching a
 * reconnecting tab up. 60ms comfortably spans a same-tick replay burst without
 * delaying a genuinely live event perceptibly.
 */
const COALESCE_MS = 60;

const pendingKeys = new Map<string, readonly unknown[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushPending(queryClient: QueryClient): void {
  const keys = [...pendingKeys.values()];
  pendingKeys.clear();
  flushTimer = null;
  for (const queryKey of keys) {
    void queryClient.invalidateQueries({ queryKey, refetchType: "all" });
  }
}

/**
 * Dedupes an invalidation by its serialized key and flushes the unique set once
 * after {@link COALESCE_MS}. The captured `queryClient` is the app singleton, so
 * coalescing across dispatch calls is safe.
 */
function coalesceInvalidate(queryClient: QueryClient, queryKey: readonly unknown[]): void {
  pendingKeys.set(JSON.stringify(queryKey), queryKey);
  flushTimer ??= setTimeout(() => flushPending(queryClient), COALESCE_MS);
}

function caseIdFromPayload(payload: LiveEventRow["payload"]): string | undefined {
  if ("case_id" in payload) return payload.case_id;
  return undefined;
}

/**
 * Maps a validated live-event row to TanStack Query invalidations, coalesced so
 * a replay burst does not storm the API with one refetch per historical row.
 */
export function dispatchLiveEvent(queryClient: QueryClient, event: LiveEventRow): void {
  const caseId = caseIdFromPayload(event.payload);
  switch (event.payload.event_type) {
    case "case.status_changed":
    case "case.assigned":
    case "case.unassigned":
    case "case.brief_ready":
    case "case.actioned":
      coalesceInvalidate(queryClient, queryKeys.cases.lists);
      if (caseId) coalesceInvalidate(queryClient, queryKeys.cases.detail(caseId));
      return;
    case "audit.new":
      coalesceInvalidate(queryClient, queryKeys.audit.all);
      return;
    case "signal.persisted":
      if (caseId) {
        coalesceInvalidate(queryClient, queryKeys.signals.detail(caseId));
        coalesceInvalidate(queryClient, queryKeys.cases.detail(caseId));
      }
      return;
    case "workflow.event":
      if (caseId) coalesceInvalidate(queryClient, queryKeys.cases.detail(caseId));
      return;
    default: {
      const _exhaustive: never = event.payload;
      return _exhaustive;
    }
  }
}

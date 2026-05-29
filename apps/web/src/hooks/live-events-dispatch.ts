import type { LiveEventRow } from "@mizan/shared";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys.ts";

function caseIdFromPayload(payload: LiveEventRow["payload"]): string | undefined {
  if ("case_id" in payload) return payload.case_id;
  return undefined;
}

/**
 * Maps a validated live-event row to TanStack Query invalidations.
 */
export function dispatchLiveEvent(queryClient: QueryClient, event: LiveEventRow): void {
  const caseId = caseIdFromPayload(event.payload);
  switch (event.payload.event_type) {
    case "case.status_changed":
    case "case.assigned":
    case "case.unassigned":
    case "case.brief_ready":
    case "case.actioned":
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.all, refetchType: "all" });
      if (caseId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.cases.detail(caseId),
          refetchType: "all",
        });
      }
      return;
    case "audit.new":
      void queryClient.invalidateQueries({ queryKey: queryKeys.audit.all, refetchType: "all" });
      return;
    case "signal.persisted":
      if (caseId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.signals.detail(caseId),
          refetchType: "all",
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.cases.detail(caseId),
          refetchType: "all",
        });
      }
      return;
    case "workflow.event":
      if (caseId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.cases.detail(caseId),
          refetchType: "all",
        });
      }
      return;
    default: {
      const _exhaustive: never = event.payload;
      return _exhaustive;
    }
  }
}

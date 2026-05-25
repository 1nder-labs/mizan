/**
 * Native EventSource hook for the workflow_events resumability tape.
 */
import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { WorkflowEventSchema, type WorkflowEvent } from "@mizan/shared";
import { queryKeys } from "@/lib/query-keys.ts";

const TAPE_EVENT_TYPES = [
  "workflow.start",
  "step.suspend",
  "step.resume",
  "workflow.finish",
] as const;

function makeFrameHandler(
  queryClient: QueryClient,
  caseId: string,
  source: EventSource,
  append: (next: WorkflowEvent) => void,
) {
  return (event: MessageEvent<string>): void => {
    const parsed = WorkflowEventSchema.safeParse(JSON.parse(event.data));
    if (!parsed.success) return;
    append(parsed.data);
    if (parsed.data.event_type === "workflow.finish") {
      source.close();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.cases.detail(caseId),
        refetchType: "all",
      });
    }
  };
}

export function useWorkflowEvents(
  caseId: string,
  enabled: boolean,
): { events: ReadonlyArray<WorkflowEvent>; connected: boolean } {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      setConnected(false);
      return;
    }

    const source = new EventSource(`/api/cases/${caseId}/stream`, { withCredentials: true });
    const handleFrame = makeFrameHandler(queryClient, caseId, source, (next) => {
      setEvents((current) => [...current, next]);
    });
    source.onopen = () => setConnected(true);
    /**
     * Closing on `onerror` cancels native auto-reconnect. The server
     * uses a `retry:` directive on transient D1 failures and a 90s
     * wall-clock cap, both of which arrive as `error` events. Without
     * an explicit close, the browser reconnects in tight loops after
     * the workflow has actually finished — every reconnect re-replays
     * the entire tape via `Last-Event-ID`.
     */
    source.onerror = () => {
      setConnected(false);
      source.close();
    };
    for (const eventName of TAPE_EVENT_TYPES) source.addEventListener(eventName, handleFrame);

    return () => source.close();
  }, [caseId, enabled, queryClient]);

  return { events, connected };
}

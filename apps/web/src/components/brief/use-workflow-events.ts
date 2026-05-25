/**
 * Native EventSource hook for the workflow_events resumability tape.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WorkflowEventSchema, type WorkflowEvent } from "@mizan/shared";
import { queryKeys } from "@/lib/query-keys.ts";

const TAPE_EVENT_TYPES = [
  "workflow.start",
  "step.suspend",
  "step.resume",
  "workflow.finish",
] as const;

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

    const url = `/api/cases/${caseId}/stream`;
    const source = new EventSource(url, { withCredentials: true });

    const handleFrame = (event: MessageEvent<string>): void => {
      const parsed = WorkflowEventSchema.safeParse(JSON.parse(event.data));
      if (!parsed.success) return;
      setEvents((current) => [...current, parsed.data]);
      if (parsed.data.event_type === "workflow.finish") {
        source.close();
        void queryClient.invalidateQueries({
          queryKey: queryKeys.cases.detail(caseId),
          refetchType: "all",
        });
      }
    };

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    for (const eventName of TAPE_EVENT_TYPES) {
      source.addEventListener(eventName, handleFrame);
    }

    return () => source.close();
  }, [caseId, enabled, queryClient]);

  return { events, connected };
}

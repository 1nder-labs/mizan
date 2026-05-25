/**
 * Native EventSource hook for the workflow_events resumability tape.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WorkflowEventSchema, type WorkflowEvent } from "@mizan/shared";
import { queryKeys } from "@/lib/query-keys.ts";

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
    };

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    for (const eventName of ["workflow.start", "step.suspend", "step.resume", "workflow.finish"]) {
      source.addEventListener(eventName, handleFrame);
    }

    source.addEventListener("workflow.finish", () => {
      source.close();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.cases.detail(caseId),
        refetchType: "all",
      });
    });

    return () => source.close();
  }, [caseId, enabled, queryClient]);

  return { events, connected };
}

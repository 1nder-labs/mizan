/**
 * Native EventSource hook that watches the workflow_events tape and
 * invalidates the case-detail query when the run finishes.
 *
 * Side-effect only: callers never need the tape contents, so the hook
 * returns `void`. If a future surface wants the raw events back, add
 * the return shape then — YAGNI applies in both directions.
 *
 * `safeParseFrame` shields the listener from a malformed SSE frame
 * (the wire is server-controlled but the JSON.parse + zod validate is
 * still the only thing standing between a poisoned chunk and an
 * uncaught listener exception that would freeze the `workflow.finish`
 * invalidation).
 */
import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { WorkflowEventSchema, type WorkflowEvent } from "@mizan/shared";
import { queryKeys } from "@/lib/query-keys.ts";

const TAPE_EVENT_TYPES = [
  "workflow.start",
  "step.suspend",
  "step.resume",
  "workflow.finish",
] as const;

function safeParseFrame(data: string): WorkflowEvent | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return undefined;
  }
  const parsed = WorkflowEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function makeFrameHandler(queryClient: QueryClient, caseId: string, source: EventSource) {
  return (event: MessageEvent<string>): void => {
    const frame = safeParseFrame(event.data);
    if (!frame) return;
    if (frame.event_type !== "workflow.finish") return;
    source.close();
    void queryClient.invalidateQueries({
      queryKey: queryKeys.cases.detail(caseId),
      refetchType: "all",
    });
  };
}

export function useWorkflowTapeInvalidation(caseId: string, enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource(`/api/cases/${caseId}/stream`, { withCredentials: true });
    const handleFrame = makeFrameHandler(queryClient, caseId, source);
    /**
     * Closing on `onerror` cancels native auto-reconnect. The server
     * emits a `retry:` directive on transient D1 failures and at the
     * 90s wall-clock cap; both arrive as `error` events. Without the
     * close, the browser reconnects in tight loops after the workflow
     * has finished — every reconnect re-replays the entire tape via
     * `Last-Event-ID`.
     */
    source.onerror = () => source.close();
    for (const eventName of TAPE_EVENT_TYPES) source.addEventListener(eventName, handleFrame);
    return () => {
      for (const eventName of TAPE_EVENT_TYPES) source.removeEventListener(eventName, handleFrame);
      source.close();
    };
  }, [caseId, enabled, queryClient]);
}

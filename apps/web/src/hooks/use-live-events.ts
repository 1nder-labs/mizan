/**
 * Org-wide live SSE hook with BroadcastChannel dedupe across tabs.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LiveEventRow } from "@mizan/shared";
import { subscribeLiveEvents } from "@/hooks/live-events-subscribe.ts";

interface UseLiveEventsOptions {
  readonly enabled?: boolean;
  readonly onEvent?: (event: LiveEventRow) => void;
}

export function useLiveEvents(topic: string, options?: UseLiveEventsOptions): void {
  const queryClient = useQueryClient();
  const enabled = options?.enabled ?? true;
  const onEvent = options?.onEvent;

  /**
   * Hold `onEvent` in a ref so an inline (non-memoized) callback from a caller
   * does not re-run the subscribe effect — re-subscribing would tear down and
   * reopen the EventSource on every render.
   */
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(
    () => subscribeLiveEvents(topic, queryClient, (event) => onEventRef.current?.(event), enabled),
    [topic, enabled, queryClient],
  );
}

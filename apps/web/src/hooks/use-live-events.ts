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
  /**
   * Window after (re)subscribe during which `onEvent` is suppressed. The SSE
   * stream replays the topic's history as a burst on connect, then sleeps
   * before tailing live events — so a short grace cleanly separates the
   * replayed catch-up (which must NOT toast) from genuinely new events. Cache
   * invalidation still runs for replayed rows; only the `onEvent` side-effect
   * is gated. Defaults to 0 (no suppression).
   */
  readonly replayGraceMs?: number;
}

export function useLiveEvents(topic: string, options?: UseLiveEventsOptions): void {
  const queryClient = useQueryClient();
  const enabled = options?.enabled ?? true;
  const onEvent = options?.onEvent;
  const replayGraceMs = options?.replayGraceMs ?? 0;

  /**
   * Hold `onEvent` in a ref so an inline (non-memoized) callback from a caller
   * does not re-run the subscribe effect — re-subscribing would tear down and
   * reopen the EventSource on every render.
   */
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const startedAt = Date.now();
    return subscribeLiveEvents(
      topic,
      queryClient,
      (event) => {
        if (Date.now() - startedAt < replayGraceMs) return;
        onEventRef.current?.(event);
      },
      enabled,
    );
  }, [topic, enabled, queryClient, replayGraceMs]);
}

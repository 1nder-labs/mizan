import type { QueryClient } from "@tanstack/react-query";
import { LiveEventRowSchema, LiveEventTypeEnum, type LiveEventRow } from "@mizan/shared";
import { dispatchLiveEvent } from "@/hooks/live-events-dispatch.ts";

/** SSE event names to subscribe — single source of truth is the zod enum. */
const LIVE_EVENT_TYPES = LiveEventTypeEnum.options;

/**
 * Logs a subscription failure. The lock runner is fire-and-forget, but a
 * rejected `navigator.locks.request` must never vanish silently — that would
 * leave the tab quiet with no diagnostic. Callers skip this after unmount,
 * where rejection is expected.
 */
function reportSubscribeError(topic: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`[useLiveEvents] subscription failed (topic=${topic}): ${reason}`);
}

function parseLiveRow(data: string): LiveEventRow | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return undefined;
  }
  const parsed = LiveEventRowSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[useLiveEvents] schema drift", parsed.error.message);
    return undefined;
  }
  return parsed.data;
}

/**
 * Opens one EventSource for a topic. No `onerror` close handler is set:
 * the browser auto-reconnects on transient drops (readyState CONNECTING)
 * and stops on fatal responses (403 / wrong content-type → CLOSED).
 * Forcing `close()` on every error would defeat native reconnection.
 */
function wireEventSource(topic: string, onRow: (row: LiveEventRow) => void): () => void {
  const source = new EventSource(`/api/events/stream?topic=${encodeURIComponent(topic)}`, {
    withCredentials: true,
  });
  const handle = (event: MessageEvent<string>): void => {
    const row = parseLiveRow(event.data);
    if (row) onRow(row);
  };
  for (const eventName of LIVE_EVENT_TYPES) {
    source.addEventListener(eventName, handle);
  }
  return () => source.close();
}

function startMasterSource(
  topic: string,
  channel: BroadcastChannel,
  handleRow: (row: LiveEventRow) => void,
): () => void {
  return wireEventSource(topic, (row) => {
    channel.postMessage(JSON.stringify(row));
    handleRow(row);
  });
}

/**
 * Subscribes one browser tab to a live-events topic with optional cross-tab dedupe.
 */
export function subscribeLiveEvents(
  topic: string,
  queryClient: QueryClient,
  onEvent: ((event: LiveEventRow) => void) | undefined,
  enabled: boolean,
): () => void {
  if (!enabled || topic.length === 0) {
    return () => {};
  }

  const channel = new BroadcastChannel(`mizan:live:${topic}`);
  let sourceClose: (() => void) | null = null;
  let releaseLock: (() => void) | null = null;
  let stopped = false;
  const handleRow = (row: LiveEventRow): void => {
    dispatchLiveEvent(queryClient, row);
    onEvent?.(row);
  };

  channel.onmessage = (message: MessageEvent<string>) => {
    const row = parseLiveRow(String(message.data));
    if (row) handleRow(row);
  };

  const runWithLock = async (): Promise<void> => {
    if (!navigator.locks) {
      sourceClose = wireEventSource(topic, handleRow);
      return;
    }
    await navigator.locks.request(`mizan:live:${topic}:owner`, async () => {
      if (stopped) return;
      sourceClose = startMasterSource(topic, channel, handleRow);
      await new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
    });
  };

  runWithLock().catch((error: unknown) => {
    if (!stopped) reportSubscribeError(topic, error);
  });
  return () => {
    stopped = true;
    releaseLock?.();
    sourceClose?.();
    channel.close();
  };
}

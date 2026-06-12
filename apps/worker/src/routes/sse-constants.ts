/**
 * Shared timing constants for the SSE stream routes (`case-stream.ts`,
 * `events-stream.ts`). One source so the per-case tape stream and the org/user
 * live-event stream stay in lockstep on tail cadence, wall-clock cap, and the
 * reconnect backoff hint sent on transient D1 failure.
 */
export const LIVE_TAIL_INTERVAL_MS = 500;
export const STREAM_WALL_CLOCK_MS = 90_000;
export const RECONNECT_BACKOFF_MS = 5_000;

/** Disconnect signatures the Workers runtime raises when the client goes away mid-write. */
const CLIENT_DISCONNECT =
  /network connection lost|connection.*(lost|reset|closed)|aborted|broken pipe/i;

/**
 * `streamSSE` onError handler. A client that navigates away, refetches, or
 * reconnects drops the SSE socket; an in-flight `writeSSE` then rejects with
 * "Network connection lost". That is expected lifecycle, not a fault — without
 * an onError it surfaces as an UNCAUGHT runtime error. Swallow the disconnect
 * (log at info), surface anything else as a real error. The stream is already
 * dead either way, so this never rethrows.
 */
export function onSseStreamError(label: string): (error: Error) => Promise<void> {
  return async (error: Error): Promise<void> => {
    const message = error instanceof Error ? error.message : String(error);
    if (CLIENT_DISCONNECT.test(message)) {
      console.log(`[${label}] client disconnected mid-stream: ${message}`);
      return;
    }
    console.error(`[${label}] stream error: ${message}`);
  };
}

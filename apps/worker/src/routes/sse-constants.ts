/**
 * Shared timing constants for the SSE stream routes (`case-stream.ts`,
 * `events-stream.ts`). One source so the per-case tape stream and the org/user
 * live-event stream stay in lockstep on tail cadence, wall-clock cap, and the
 * reconnect backoff hint sent on transient D1 failure.
 */
export const LIVE_TAIL_INTERVAL_MS = 500;
export const STREAM_WALL_CLOCK_MS = 90_000;
export const RECONNECT_BACKOFF_MS = 5_000;

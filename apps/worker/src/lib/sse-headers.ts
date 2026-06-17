/**
 * SSE response headers shared across routes and the BriefStreamDO.
 * `Content-Encoding: identity` opts the stream out of Cloudflare edge
 * compression, which otherwise buffers the whole body before flushing —
 * defeating real-time streaming.
 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Content-Encoding": "identity",
} as const;

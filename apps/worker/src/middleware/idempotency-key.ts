/**
 * KV-backed HTTP idempotency middleware.
 *
 * Applied via:
 * ```ts
 * app.use("/api/cases/*", idempotencyKey);
 * // and per-route on /api/admin/echo (U9)
 * ```
 *
 * Auth routes are NOT wrapped — better-auth manages its own replay
 * semantics and needs precise rate-limit behaviour on duplicate sign-ins.
 *
 * Key shape: `idem:{Idempotency-Key header value}` → JSON `CachedResponse`.
 * TTL: 86 400 s (24 h). Matches PRD §7.10 Layer 1.
 *
 * Only JSON responses are cached. Non-JSON responses fall through silently
 * (no caching) — see the JSDoc above the try/catch block for the rationale.
 */

import type { KVNamespace } from "@cloudflare/workers-types";
import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../env.ts";

/** Payload stored in KV for each idempotent request. */
interface CachedResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
}

const IDEM_TTL_SECONDS = 86_400;
const CONTENT_TYPE_JSON = "application/json";

/**
 * Type guard for narrowing to `Record<string, unknown>`.
 * Used as the first step in compound structural guards.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Type guard that checks every value in an object is a string.
 * Used to validate the optional `headers` field of `CachedResponse`.
 */
function isStringRecord(v: unknown): v is Record<string, string> {
  if (!isRecord(v)) return false;
  for (const value of Object.values(v)) {
    if (typeof value !== "string") return false;
  }
  return true;
}

/**
 * Type guard for `CachedResponse`. Validates KV-returned values before
 * trusting them — KV's eventual-consistency window means a warm-but-stale
 * read could theoretically return a value written by an old schema.
 */
function isCachedResponse(v: unknown): v is CachedResponse {
  if (!isRecord(v)) return false;
  if (typeof v.status !== "number") return false;
  if (!("body" in v)) return false;
  if (v.headers !== undefined && !isStringRecord(v.headers)) return false;
  return true;
}

/**
 * Builds a replay `Response` from a `CachedResponse` payload.
 * Uses the Web `Response` constructor directly to avoid Hono's
 * `c.json()` overloads which require a `ContentfulStatusCode` literal.
 */
function buildReplayResponse(cached: CachedResponse): Response {
  const replayHeaders: Record<string, string> = {
    "Content-Type": CONTENT_TYPE_JSON,
    "Idempotency-Replay": "true",
    ...cached.headers,
  };
  return new Response(JSON.stringify(cached.body), {
    status: cached.status,
    headers: replayHeaders,
  });
}

/**
 * Writes a 2xx JSON response to KV under `idem:{key}` with the 24h TTL.
 *
 * Cache successful 2xx responses only per PRD §7.10. Non-2xx responses
 * (4xx validation errors, 429 rate-limits, 5xx server errors) are NOT
 * cached so retries with the same key after fixing the request can succeed,
 * and so a transient server error is not pinned for 24h.
 *
 * The Content-Type check avoids cloning large binary responses; the inner
 * try/catch guards against JSON-typed responses whose body fails to parse
 * (corrupt upstream output). The catch is deliberate — a non-JSON response
 * is not an error to log.
 */
async function cacheResponse(kv: KVNamespace, key: string, res: Response): Promise<void> {
  const isCacheableStatus = res.status >= 200 && res.status < 300;
  const isJsonResponse = res.headers.get("Content-Type")?.includes("application/json") ?? false;
  if (!isCacheableStatus || !isJsonResponse) return;
  try {
    const body: unknown = await res.clone().json();
    await kv.put(
      `idem:${key}`,
      JSON.stringify({ status: res.status, body, headers: { "Content-Type": CONTENT_TYPE_JSON } }),
      { expirationTtl: IDEM_TTL_SECONDS },
    );
  } catch {
    /* JSDoc above documents the deliberate skip-on-malformed-JSON behaviour. */
  }
}

/**
 * Hono middleware that replays previously-seen responses for idempotent
 * mutations. GET and HEAD requests and requests without an `Idempotency-Key`
 * header bypass the middleware entirely.
 *
 * Race-condition limitation: two POSTs with the same key arriving before
 * the first KV write propagates will BOTH find a cache miss and execute
 * the handler. KV has no compare-and-swap. PRD §7.10 Layer 1 accepts this
 * as best-effort; Layer 2 (producer guard on `cases.current_run_id`) +
 * Layer 3 (queue-consumer `claimRun`) backstop for workflow-bearing
 * routes. Phase 1 `/api/admin/echo` has no downstream side effects so the
 * worst case is a duplicated echo.
 */
export const idempotencyKey = createMiddleware<{ Bindings: CloudflareBindings }>(
  async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") {
      await next();
      return;
    }
    const key = c.req.header("Idempotency-Key");
    if (!key) {
      await next();
      return;
    }
    const raw = await c.env.KV.get(`idem:${key}`, "json");
    if (isCachedResponse(raw)) return buildReplayResponse(raw);
    await next();
    await cacheResponse(c.env.KV, key, c.res);
    return;
  },
);

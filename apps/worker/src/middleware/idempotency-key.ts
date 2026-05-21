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
 * Hono middleware that replays previously-seen responses for idempotent
 * mutations. GET and HEAD requests and requests without an `Idempotency-Key`
 * header bypass the middleware entirely.
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
    if (isCachedResponse(raw)) {
      return buildReplayResponse(raw);
    }

    await next();

    if (c.res.status >= 200 && c.res.status < 500) {
      /**
       * Intentional silent catch: if the response body is not valid JSON
       * (e.g. a binary download or plain-text error page), `.json()` throws
       * and we skip caching. This is correct behaviour — idempotency caching
       * applies only to JSON API responses. Logging a parse error here would
       * produce false-positive noise for legitimate non-JSON routes.
       */
      try {
        const body: unknown = await c.res.clone().json();
        await c.env.KV.put(
          `idem:${key}`,
          JSON.stringify({
            status: c.res.status,
            body,
            headers: { "Content-Type": CONTENT_TYPE_JSON },
          }),
          { expirationTtl: IDEM_TTL_SECONDS },
        );
      } catch {
        /* JSDoc above documents the deliberate skip-on-non-JSON behaviour. */
      }
    }
    return;
  },
);

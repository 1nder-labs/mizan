/**
 * KV-backed fixed-window per-user rate limiter for the client portal's mutating
 * endpoints (campaign create, evidence upload, note writes, submit, delete).
 *
 * better-auth's own `rateLimit` covers only `/api/auth/*`, so the authenticated
 * `/api/portal/*` write surface was unbounded — a signed-in client could spam
 * DRAFT-case + R2-object creation (PRD Phase 10, client-portal review finding
 * #8). Read-only methods pass straight through; only writes consume quota.
 *
 * The window is fixed, not sliding: a per-user counter keyed by the current
 * 60s bucket, with a TTL of two windows so stale buckets self-evict. KV has no
 * atomic increment, so a concurrent burst may under-count by a few requests —
 * an acceptable abuse-mitigation tradeoff, not a billing-grade meter. The
 * counter is incremented before the handler runs, so failed/404 attempts also
 * cost quota (spamming non-existent ids is exactly the abuse being bounded).
 */
import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../env.ts";
import type { ViewerVariables } from "./require-role.ts";

const DEFAULT_WINDOW_SECONDS = 60;
const MAX_WRITES_PER_WINDOW = 30;
const WRITE_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Resolves the fixed-window length. Defaults to 60s; `PORTAL_RL_WINDOW_SECONDS`
 * overrides it (integration tests pin a long window so a 30-write loop cannot
 * straddle a wall-clock window roll). Falls back to the default for unset/invalid.
 */
function resolveWindowSeconds(env: CloudflareBindings): number {
  const raw = env.PORTAL_RL_WINDOW_SECONDS;
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_SECONDS;
}

/**
 * Builds the per-user portal write limiter. Must mount AFTER the role guard so
 * `c.var.viewer.userId` is populated — the counter is keyed per authenticated
 * client, never per IP, so it can't be evaded by rotating source addresses.
 */
export function portalRateLimit() {
  return createMiddleware<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>(
    async (c, next) => {
      if (!WRITE_METHODS.has(c.req.method)) return next();

      const windowSeconds = resolveWindowSeconds(c.env);
      const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
      const key = `portal-rl:${c.var.viewer.userId}:${windowId}`;
      const used = Number.parseInt((await c.env.KV.get(key)) ?? "0", 10);

      if (used >= MAX_WRITES_PER_WINDOW) {
        c.header("Retry-After", String(windowSeconds));
        return c.json({ error: "rate_limited" }, 429);
      }

      await c.env.KV.put(key, String(used + 1), { expirationTtl: windowSeconds * 2 });
      return next();
    },
  );
}

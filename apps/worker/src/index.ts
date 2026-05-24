/**
 * Cloudflare Worker entry point.
 *
 * Middleware order:
 * 1. `authInit` — global, runs on every request; sets `c.var.auth`
 *    so sub-routers can call `c.var.auth.api.getSession` without
 *    re-constructing the better-auth instance.
 * 2. Sub-router middleware — `requireRole` inside admin routes,
 *    `idempotencyKey` on the `/api/admin/echo` route specifically.
 *
 * `AppType` is exported for Phase 6's Hono RPC client (`hc<AppType>()`)
 * consumed via `@mizan/shared/app-type` (deferred to Phase 6 per PRD §6).
 */

import { Hono } from "hono";
import type { CloudflareBindings } from "./env.ts";
import { authInit, type AuthVariables } from "./middleware/auth-init.ts";
import { dispatchQueue } from "./queue/dispatch.ts";
import { adminRoutes } from "./routes/admin.ts";
import { authRoutes } from "./routes/auth.ts";
import { caseRoutes } from "./routes/cases.ts";
import { meRoutes } from "./routes/me.ts";

const app = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()
  .use("*", authInit)
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/api/auth", authRoutes)
  .route("/api/me", meRoutes)
  .route("/api/admin", adminRoutes)
  .route("/api/cases", caseRoutes);

export type AppType = typeof app;

/**
 * Module-Worker entry combining Hono's `fetch` handler with the queue
 * consumer. Pattern is per Hono Cloudflare Workers docs:
 * https://hono.dev/docs/getting-started/cloudflare-workers — direct
 * `fetch: app.fetch` assignment alongside sibling handlers. We do NOT
 * annotate the literal with `satisfies ExportedHandler<CloudflareBindings>`
 * because `@cloudflare/workers-types` ships its own `Response`/`Request`
 * types that diverge structurally from the global DOM `Response` Hono
 * returns (e.g. `Headers.getAll`). The structural contract is enforced
 * by Cloudflare's runtime ABI, and `dispatchQueue`'s signature already
 * matches the queue handler shape on its own.
 */
export default {
  fetch: app.fetch,
  queue: dispatchQueue,
};

/**
 * Cloudflare Worker entry point.
 *
 * Two-tier app: a top-level `app` carries `/health` and mounts the
 * `/api` sub-app; `apiApp` chains every domain sub-router and is the
 * type exported as `AppType` for Phase 6's Hono RPC client. With
 * `hc<AppType>('/api')` the client tree reads as
 * `client.cases.$get(...)` — no `api.api.*` double-prefix.
 *
 * Middleware order:
 * 1. `authInit` — global on `/api`, runs on every request; sets
 *    `c.var.auth` so sub-routers can call `c.var.auth.api.getSession`
 *    without re-constructing the better-auth instance.
 * 2. Sub-router middleware — `requireRole` inside admin / cases,
 *    `idempotencyKey` on the brief POST and admin echo.
 */

import { Hono } from "hono";
import type { CloudflareBindings } from "./env.ts";
import { authInit, type AuthVariables } from "./middleware/auth-init.ts";
import { dispatchQueue } from "./queue/dispatch.ts";
import { adminRoutes } from "./routes/admin.ts";
import { authRoutes } from "./routes/auth.ts";
import { caseRoutes } from "./routes/cases.ts";
import { meRoutes } from "./routes/me.ts";
import { policyClauseRoutes } from "./routes/policy-clauses.ts";
import { teamRoutes } from "./routes/team.ts";

const apiApp = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()
  .use("*", authInit)
  .route("/auth", authRoutes)
  .route("/me", meRoutes)
  .route("/admin", adminRoutes)
  .route("/cases", caseRoutes)
  .route("/policy", policyClauseRoutes)
  .route("/team", teamRoutes);

const app = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/api", apiApp);

export type AppType = typeof apiApp;

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

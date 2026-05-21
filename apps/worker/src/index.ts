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
import { adminRoutes } from "./routes/admin.ts";
import { authRoutes } from "./routes/auth.ts";
import { caseRoutes } from "./routes/cases.ts";
import { meRoutes } from "./routes/me.ts";

const BINDING_NAMES = ["DB", "R2_BUCKET", "VECTORIZE", "KV", "BRIEF_QUEUE", "ASSETS"] as const;

const app = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()
  .use("*", authInit)
  .get("/health", (c) =>
    c.json({
      status: "ok",
      bindings: BINDING_NAMES,
      runtime: "cloudflare-workers",
    }),
  )
  .route("/api/auth", authRoutes)
  .route("/api/me", meRoutes)
  .route("/api/admin", adminRoutes)
  .route("/api/cases", caseRoutes);

export type AppType = typeof app;
export default app;

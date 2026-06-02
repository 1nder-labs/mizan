/**
 * Better-auth handler mounted at `/api/auth/*`.
 *
 * All sign-up / sign-in / sign-out / session / file endpoints are
 * handled by better-auth internally. No Mizan-side middleware wraps these
 * routes — better-auth manages CSRF protection and rate-limiting itself
 * (configured in `apps/worker/src/auth/index.ts`).
 *
 * Mount via: `app.route("/api/auth", authRoutes)` in `index.ts`.
 */

import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth-init.ts";
import { nativeOrgGuard } from "../middleware/native-org-guard.ts";
import type { CloudflareBindings } from "../env.ts";

export const authRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: AuthVariables;
}>()
  .use("*", nativeOrgGuard)
  .all("*", (c) => c.var.auth.handler(c.req.raw));

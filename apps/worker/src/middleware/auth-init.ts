/**
 * Per-request auth initialisation middleware.
 *
 * Mount as `app.use("*", authInit)` before any route that reads
 * `c.var.auth`. `createAuth` is called once per request — NOT at module
 * load time — because Cloudflare Worker env bindings are scoped to the
 * incoming request and are not available as module-level singletons (PRD §12).
 */

import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth/index.ts";
import type { CloudflareBindings } from "../env.ts";

type AuthVariables = {
  auth: ReturnType<typeof createAuth>;
};

export const authInit = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  c.set("auth", createAuth(c.env, c.req.raw.cf ?? {}, new URL(c.req.url).origin));
  await next();
});

export type { AuthVariables };

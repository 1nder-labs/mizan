/**
 * `GET /api/me` — returns the current session user's identity.
 *
 * Auth is verified in-handler via `c.var.auth.api.getSession`. There is no
 * route-group middleware here because `getSession` already performs the
 * session lookup; wrapping with `requireRole` would be redundant.
 *
 * Role extraction uses `extractRole` from `role-utils.ts` to safely narrow
 * `session.user` (whose static type loses `role` due to the upstream
 * `@ts-expect-error` in `auth/index.ts`) without any cast.
 */

import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth-init.ts";
import type { CloudflareBindings } from "../env.ts";
import { extractRole } from "../middleware/role-utils.ts";

export const meRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: AuthVariables;
}>().get("/", async (c) => {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      role: extractRole(session.user),
    },
  });
});

/**
 * Declarative role-gate middleware factory.
 *
 * Usage:
 * ```ts
 * app.use("/api/admin/*", requireRole("admin"));
 * app.use("/api/cases/*", requireRole(["reviewer", "admin"]));
 * ```
 *
 * Per PRD §12, NEVER inline body-level role checks in handlers —
 * always gate at the route group level with `requireRole`.
 *
 * Reads the session via `c.var.auth.api.getSession` which was set by the
 * `authInit` middleware (must be mounted before this middleware). The
 * `user` context variable is typed as `RoleVariables["user"]` so
 * downstream handlers can read `c.var.user` with full type safety.
 */

import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../env.ts";
import type { AuthVariables } from "./auth-init.ts";
import { extractRole, type Role } from "./role-utils.ts";

/** Extends AuthVariables with the resolved user identity after role check. */
export type RoleVariables = AuthVariables & {
  user: { id: string; role: Role };
};

/**
 * Returns a Hono middleware that:
 * 1. Retrieves the current session from `c.var.auth`.
 * 2. Returns 401 if no session exists.
 * 3. Extracts the role from `session.user` (defaults to `"reviewer"` for
 *    unrecognised shapes from older sessions or missing additionalFields).
 * 4. Returns 403 if the resolved role is not in the `allowed` set.
 * 5. Calls `c.set("user", { id, role })` and then calls `next()`.
 */
export function requireRole(
  allowed: Role | Role[],
): ReturnType<typeof createMiddleware<{ Bindings: CloudflareBindings; Variables: RoleVariables }>> {
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  return createMiddleware<{ Bindings: CloudflareBindings; Variables: RoleVariables }>(
    async (c, next) => {
      const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) return c.json({ error: "Unauthorized" }, 401);
      const role = extractRole(session.user);
      if (roles.indexOf(role) === -1) return c.json({ error: "Forbidden" }, 403);
      c.set("user", { id: session.user.id, role });
      await next();
      return;
    },
  );
}

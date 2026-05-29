/**
 * Declarative role-gate middleware factory.
 *
 * Reads per-org role from the `member` table for `session.activeOrganizationId`.
 * Sets `c.var.viewer` as the canonical identity for handlers and Mastra tools.
 */

import { createMiddleware } from "hono/factory";
import { and, eq, member, makeDb } from "@mizan/db";
import { ViewerContextSchema, type ViewerContext } from "@mizan/shared";
import { readActiveOrganizationId } from "../auth/session-utils.ts";
import type { CloudflareBindings } from "../env.ts";
import type { AuthVariables } from "./auth-init.ts";
import type { Role } from "./role-utils.ts";

export type ViewerVariables = AuthVariables & {
  viewer: ViewerContext;
};

function parseMemberRole(value: string): Role | null {
  if (value === "reviewer" || value === "admin") return value;
  return null;
}

/**
 * Returns middleware that resolves the caller's org-scoped role from `member`.
 */
export function requireRole(
  allowed: Role | Role[],
): ReturnType<
  typeof createMiddleware<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>
> {
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  return createMiddleware<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>(
    async (c, next) => {
      const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = readActiveOrganizationId(session.session);
      if (!activeOrgId) {
        return c.json({ error: "no_active_org_membership" }, 403);
      }

      const db = makeDb(c.env.DB);
      const membership = await db
        .select({ role: member.role })
        .from(member)
        .where(and(eq(member.userId, session.user.id), eq(member.organizationId, activeOrgId)))
        .get();

      if (!membership) {
        return c.json({ error: "no_active_org_membership" }, 403);
      }

      const role = parseMemberRole(membership.role);
      if (!role || roles.indexOf(role) === -1) {
        return c.json({ error: "Forbidden" }, 403);
      }

      const viewer = ViewerContextSchema.parse({
        userId: session.user.id,
        role,
        organizationId: activeOrgId,
      });
      c.set("viewer", viewer);
      await next();
      return;
    },
  );
}

/** @deprecated Use ViewerVariables — kept for incremental migration of type imports. */
export type RoleVariables = ViewerVariables;

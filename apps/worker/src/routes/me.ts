/**
 * `GET /api/me` — returns the current session user's identity and active org role.
 */
import { and, eq, makeDb, members } from "@mizan/db";
import { MeResponseSchema } from "@mizan/shared";
import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth-init.ts";
import type { CloudflareBindings } from "../env.ts";
import { readActiveOrganizationId } from "../auth/session-utils.ts";
import type { Role } from "../middleware/role-utils.ts";

function parseMemberRole(value: string): Role {
  if (value === "admin") return "admin";
  return "reviewer";
}

export const meRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: AuthVariables;
}>().get("/", async (c) => {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const activeOrgId = readActiveOrganizationId(session.session);
  let role: Role = "reviewer";
  if (activeOrgId) {
    const db = makeDb(c.env.DB);
    const membership = await db
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.userId, session.user.id), eq(members.organizationId, activeOrgId)))
      .get();
    if (membership) role = parseMemberRole(membership.role);
  }

  return c.json(
    MeResponseSchema.parse({
      user: {
        id: session.user.id,
        email: session.user.email,
        role,
        activeOrganizationId: activeOrgId ?? null,
      },
    }),
  );
});

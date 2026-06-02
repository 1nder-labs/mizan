/**
 * `GET /api/me` — returns the current session user's identity and active org role.
 */
import { and, eq, makeDb, members } from "@mizan/db";
import { MeResponseSchema } from "@mizan/shared";
import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth-init.ts";
import type { CloudflareBindings } from "../env.ts";
import { resolveActiveOrgId } from "../auth/active-org.ts";
import type { Role } from "../middleware/role-utils.ts";

/**
 * Maps a stored member role to the wire `Role`. An unrecognized value falls
 * back to `client` — the least-privileged role — so a mislabeled membership
 * can never be silently upgraded into reviewer/admin access via `/api/me`.
 */
function parseMemberRole(value: string): Role {
  if (value === "admin") return "admin";
  if (value === "client") return "client";
  if (value === "reviewer") return "reviewer";
  return "client";
}

export const meRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: AuthVariables;
}>().get("/", async (c) => {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const activeOrgId = await resolveActiveOrgId(c.env, c.var.auth, c.req.raw.headers, session);
  let role: Role = "client";
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

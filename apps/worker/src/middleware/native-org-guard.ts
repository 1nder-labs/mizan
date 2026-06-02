import { createMiddleware } from "hono/factory";
import { and, eq, makeDb, members } from "@mizan/db";
import { resolveActiveOrgId } from "../auth/active-org.ts";
import type { CloudflareBindings } from "../env.ts";
import type { AuthVariables } from "./auth-init.ts";

const ORG_ENDPOINT_MARKER = "/organization/";

/** True when the user's role in the given org is `client`. */
async function isClientMember(
  env: CloudflareBindings,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const membership = await makeDb(env.DB)
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.organizationId, organizationId)))
    .get();
  return membership?.role === "client";
}

/**
 * Denies `client`-role members the native better-auth organization endpoints
 * (`/api/auth/organization/*`).
 *
 * In the shared-review-org model every client is a member of the one review
 * org, so better-auth's member-readable roster endpoints
 * (`get-full-organization`, `list-members`, `list-invitations`) would let one
 * client enumerate reviewers and sibling clients. Clients reach their data only
 * through `/api/portal/*` and need no org endpoint over HTTP (the active-org
 * backfill calls the server API, not this route), so the entire
 * `/organization/*` surface is denied to them — robust against endpoints added
 * by future better-auth versions. Non-`client` callers and every non-org auth
 * route (sign-in/out, session) pass through untouched, the latter with zero
 * added work via the path short-circuit.
 */
export const nativeOrgGuard = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  if (!c.req.path.includes(ORG_ENDPOINT_MARKER)) {
    await next();
    return;
  }
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (session) {
    const activeOrgId = await resolveActiveOrgId(c.env, c.var.auth, c.req.raw.headers, session);
    if (activeOrgId && (await isClientMember(c.env, session.user.id, activeOrgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
  }
  await next();
  return;
});

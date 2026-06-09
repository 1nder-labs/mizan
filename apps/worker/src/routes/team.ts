/**
 * Phase 7.7 — team management via better-auth organization plugin.
 */
import { zValidator } from "@hono/zod-validator";
import { makeDb } from "@mizan/db";
import {
  CreateInvitationRequestSchema,
  CreateInvitationResponseSchema,
  InvitationAcceptResponseSchema,
  InvitationLookupResponseSchema,
  TeamErrorBodySchema,
  TeamInvitationsResponseSchema,
  TeamMembersResponseSchema,
  type TeamErrorCode,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import {
  getOrganizationInvitationApi,
  parseOrganizationInvitation,
} from "../auth/org-invitations.ts";
import type { CloudflareBindings } from "../env.ts";
import { listTeamMembers } from "../handlers/read-handlers.ts";
import { authInit, type AuthVariables } from "../middleware/auth-init.ts";
import { requireRole, type ViewerVariables } from "../middleware/require-role.ts";

const TokenParamSchema = z.object({ token: z.string().min(1) });

function teamError(code: TeamErrorCode): { error: TeamErrorCode } {
  return TeamErrorBodySchema.parse({ error: code });
}

function inviteUrlFrom(request: Request, invitationId: string): string {
  const u = new URL(request.url);
  return `${u.origin}/invite/${invitationId}`;
}

const membersRoute = new Hono<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>()
  .use("*", requireRole(["reviewer", "admin"]))
  .get("/members", async (c) => {
    const db = makeDb(c.env.DB);
    const members = await listTeamMembers(c.var.viewer, db);
    const payload = TeamMembersResponseSchema.parse({ members });
    return c.json(payload);
  });

const adminInvitations = new Hono<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>()
  .use("*", requireRole("admin"))
  .get("/invitations", async (c) => {
    const orgApi = getOrganizationInvitationApi(c.var.auth);
    const listedRaw = await orgApi.listInvitations({
      headers: c.req.raw.headers,
      query: { organizationId: c.var.viewer.organizationId },
    });
    const listed = Array.isArray(listedRaw)
      ? listedRaw.map((row) => parseOrganizationInvitation(row))
      : [];
    const payload = TeamInvitationsResponseSchema.parse({
      invitations: listed.map((inv) => ({
        id: inv.id,
        token: inv.id,
        email: inv.email,
        role: inv.role,
        invitedBy: inv.inviterId,
        acceptedAt: inv.status === "accepted" ? Date.now() : null,
        acceptedBy: null,
        expiresAt: inv.expiresAt.getTime(),
        createdAt: inv.createdAt.getTime(),
      })),
    });
    return c.json(payload);
  })
  .post("/invitations", zValidator("json", CreateInvitationRequestSchema), async (c) => {
    const { email, role } = c.req.valid("json");
    const orgApi = getOrganizationInvitationApi(c.var.auth);
    const createdRaw = await orgApi.createInvitation({
      body: { email: email.toLowerCase(), role, organizationId: c.var.viewer.organizationId },
      headers: c.req.raw.headers,
    });
    const created = parseOrganizationInvitation(createdRaw);
    const payload = CreateInvitationResponseSchema.parse({
      invitation: {
        id: created.id,
        token: created.id,
        email: created.email,
        role: created.role,
        invitedBy: created.inviterId,
        acceptedAt: null,
        acceptedBy: null,
        expiresAt: created.expiresAt.getTime(),
        createdAt: created.createdAt.getTime(),
      },
      inviteUrl: inviteUrlFrom(c.req.raw, created.id),
    });
    return c.json(payload, 201);
  });

const publicInvitations = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()
  .use("*", authInit)
  .get("/invitations/:token", zValidator("param", TokenParamSchema), async (c) => {
    const { token } = c.req.valid("param");
    const orgApi = getOrganizationInvitationApi(c.var.auth);
    const invitationRaw = await orgApi.getInvitation({
      query: { id: token },
      headers: c.req.raw.headers,
    });
    if (!invitationRaw) return c.json(teamError("invitation_not_found"), 404);
    const invitation = parseOrganizationInvitation(invitationRaw);
    const payload = InvitationLookupResponseSchema.parse({
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.getTime(),
      accepted: invitation.status === "accepted",
      inviterName: "Mizan admin",
    });
    return c.json(payload);
  })
  .post("/invitations/:token/accept", zValidator("param", TokenParamSchema), async (c) => {
    const { token } = c.req.valid("param");
    const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json(teamError("unauthorized"), 401);
    const orgApi = getOrganizationInvitationApi(c.var.auth);
    const invitationRaw = await orgApi.getInvitation({
      query: { id: token },
      headers: c.req.raw.headers,
    });
    if (!invitationRaw) return c.json(teamError("invitation_not_found"), 404);
    const invitation = parseOrganizationInvitation(invitationRaw);
    if (invitation.status === "accepted") {
      return c.json(teamError("invitation_already_accepted"), 409);
    }
    if (invitation.status !== "pending") return c.json(teamError("invitation_not_found"), 404);
    if (invitation.expiresAt.getTime() <= Date.now()) {
      return c.json(teamError("invitation_expired"), 410);
    }
    if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return c.json(teamError("email_mismatch"), 403);
    }
    await orgApi.acceptInvitation({ body: { invitationId: token }, headers: c.req.raw.headers });
    const body = InvitationAcceptResponseSchema.parse({
      role: invitation.role,
      redirectTo: "/queue?view=board",
    });
    return c.json(body);
  });

export const teamRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()
  .route("/", membersRoute)
  .route("/", adminInvitations)
  .route("/", publicInvitations);

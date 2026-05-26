/**
 * Phase 7.6 U4 — team management surface.
 *
 * Routes (all auth-gated; admin-only unless noted):
 *   - GET  /api/team/members             — reviewer | admin: list members
 *   - GET  /api/team/invitations         — admin: list outstanding invitations
 *   - POST /api/team/invitations         — admin: create invitation, returns token + URL
 *   - GET  /api/team/invitations/:token  — PUBLIC: look up invitation by token
 *   - POST /api/team/invitations/:token/accept
 *                                        — authenticated: mark accepted +
 *                                          escalate user role per invitation
 *
 * The minimal "invite link" UX dodges Resend/email entirely: admin
 * generates a URL, copies it, sends manually. Acceptance requires the
 * accepting user to be signed up first (better-auth handles signup);
 * the accept handler then sets `accepted_at` + bumps their role.
 */
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull } from "drizzle-orm";
import { invitations, makeDb, users, type Db } from "@mizan/db";
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
import type { CloudflareBindings } from "../env.ts";
import { authInit, type AuthVariables } from "../middleware/auth-init.ts";
import { requireRole, type RoleVariables } from "../middleware/require-role.ts";

const TokenParamSchema = z.object({ token: z.string().min(1) });

const DEFAULT_INVITE_TTL_HOURS = 72;

function teamError(code: TeamErrorCode): { error: TeamErrorCode } {
  return TeamErrorBodySchema.parse({ error: code });
}

function inviteUrlFrom(request: Request, token: string): string {
  const u = new URL(request.url);
  return `${u.origin}/invite/${token}`;
}

async function listMembers(db: Db) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .all();
}

async function listInvitations(db: Db) {
  return db.select().from(invitations).orderBy(desc(invitations.created_at)).all();
}

async function findInvitationByToken(db: Db, token: string) {
  return db.select().from(invitations).where(eq(invitations.token, token)).get();
}

async function findOpenInvitationByEmail(db: Db, email: string) {
  return db
    .select()
    .from(invitations)
    .where(and(eq(invitations.email, email.toLowerCase()), isNull(invitations.accepted_at)))
    .get();
}

const membersRoute = new Hono<{ Bindings: CloudflareBindings; Variables: RoleVariables }>()
  .use("*", requireRole(["reviewer", "admin"]))
  .get("/members", async (c) => {
    const db = makeDb(c.env.DB);
    const rows = await listMembers(db);
    const payload = TeamMembersResponseSchema.parse({
      members: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role ?? "reviewer",
        createdAt: row.createdAt.getTime(),
      })),
    });
    return c.json(payload);
  });

const adminInvitations = new Hono<{ Bindings: CloudflareBindings; Variables: RoleVariables }>()
  .use("*", requireRole("admin"))
  .get("/invitations", async (c) => {
    const db = makeDb(c.env.DB);
    const rows = await listInvitations(db);
    const payload = TeamInvitationsResponseSchema.parse({
      invitations: rows.map((row) => ({
        id: row.id,
        token: row.token,
        email: row.email,
        role: row.role,
        invitedBy: row.invited_by,
        acceptedAt: row.accepted_at ? row.accepted_at.getTime() : null,
        acceptedBy: row.accepted_by,
        expiresAt: row.expires_at.getTime(),
        createdAt: row.created_at.getTime(),
      })),
    });
    return c.json(payload);
  })
  .post("/invitations", zValidator("json", CreateInvitationRequestSchema), async (c) => {
    const { email, role, ttlHours } = c.req.valid("json");
    const db = makeDb(c.env.DB);
    const lower = email.toLowerCase();
    const existing = await findOpenInvitationByEmail(db, lower);
    if (existing) return c.json(teamError("duplicate_email"), 409);
    const token = crypto.randomUUID().replace(/-/g, "");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (ttlHours ?? DEFAULT_INVITE_TTL_HOURS) * 3_600_000);
    const insertion = await db
      .insert(invitations)
      .values({
        token,
        email: lower,
        role,
        invited_by: c.var.user.id,
        expires_at: expiresAt,
        created_at: now,
      })
      .returning();
    const inv = insertion[0];
    if (!inv) return c.json(teamError("user_not_found"), 500);
    const payload = CreateInvitationResponseSchema.parse({
      invitation: {
        id: inv.id,
        token: inv.token,
        email: inv.email,
        role: inv.role,
        invitedBy: inv.invited_by,
        acceptedAt: null,
        acceptedBy: null,
        expiresAt: inv.expires_at.getTime(),
        createdAt: inv.created_at.getTime(),
      },
      inviteUrl: inviteUrlFrom(c.req.raw, token),
    });
    return c.json(payload, 201);
  });

const publicInvitations = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()
  .use("*", authInit)
  .get("/invitations/:token", zValidator("param", TokenParamSchema), async (c) => {
    const { token } = c.req.valid("param");
    const db = makeDb(c.env.DB);
    const inv = await findInvitationByToken(db, token);
    if (!inv) return c.json(teamError("invitation_not_found"), 404);
    const inviter = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, inv.invited_by))
      .get();
    const payload = InvitationLookupResponseSchema.parse({
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expires_at.getTime(),
      accepted: inv.accepted_at !== null,
      inviterName: inviter?.name ?? "Mizan admin",
    });
    return c.json(payload);
  })
  .post("/invitations/:token/accept", zValidator("param", TokenParamSchema), async (c) => {
    const { token } = c.req.valid("param");
    const db = makeDb(c.env.DB);
    const inv = await findInvitationByToken(db, token);
    if (!inv) return c.json(teamError("invitation_not_found"), 404);
    if (inv.accepted_at !== null) return c.json(teamError("invitation_already_accepted"), 409);
    if (inv.expires_at.getTime() < Date.now()) return c.json(teamError("invitation_expired"), 410);
    const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json(teamError("forbidden"), 401);
    const sessionUser = session.user;
    if (sessionUser.email.toLowerCase() !== inv.email) {
      return c.json(teamError("email_mismatch"), 403);
    }
    await db.transaction(async (tx) => {
      await tx.update(users).set({ role: inv.role }).where(eq(users.id, sessionUser.id));
      await tx
        .update(invitations)
        .set({ accepted_at: new Date(), accepted_by: sessionUser.id })
        .where(eq(invitations.id, inv.id));
    });
    const payload = InvitationAcceptResponseSchema.parse({
      role: inv.role,
      redirectTo: "/queue?view=board",
    });
    return c.json(payload);
  });

export const teamRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()
  .route("/", membersRoute)
  .route("/", adminInvitations)
  .route("/", publicInvitations);

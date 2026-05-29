import { and, asc, eq, gt } from "drizzle-orm";
import { invitation, member, type Db } from "@mizan/db";
import { getOrganizationInvitationApi, type AuthLike } from "./org-invitations.ts";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function workspaceName(user: { name?: string | null; email: string }): string {
  const base = user.name?.trim() || user.email;
  return `${base}'s Workspace`;
}

function workspaceSlug(user: { name?: string | null; email: string }): string {
  const base = slugify(user.name?.trim() || user.email.split("@")[0] || "user");
  return `${base}-${Date.now()}`;
}

/**
 * Provisions organization membership for a newly-created user.
 *
 * Runs in `databaseHooks.user.create.after`, where better-auth has not yet
 * issued a session — so the native organization APIs are invoked in their
 * server-only mode (`createOrganization`/`addMember` accept an explicit
 * `userId` when no session headers are present). Membership is created here,
 * before `session.create.before`, so `seedActiveOrganization` can resolve the
 * active org in the same signup flow.
 *
 * Invited signups join the inviter's org; the invitation row is marked
 * accepted to keep it single-use (better-auth exposes no server-only accept
 * endpoint — `addMember` adds the membership and the status flip consumes the
 * invitation).
 */
async function provisionOrgOnSignup(
  user: { id: string; email: string; name?: string | null },
  getDb: () => Db,
  getAuth: () => AuthLike,
): Promise<void> {
  const db = getDb();
  const api = getOrganizationInvitationApi(getAuth());
  const pending = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.email, user.email.toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date(Date.now())),
      ),
    )
    .get();
  if (pending) {
    await api.addMember({
      body: { userId: user.id, organizationId: pending.organizationId, role: pending.role },
    });
    await db.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, pending.id));
    return;
  }
  await api.createOrganization({
    body: { name: workspaceName(user), slug: workspaceSlug(user), userId: user.id },
  });
}

async function seedActiveOrganization(
  session: { userId: string; activeOrganizationId?: string | null },
  getDb: () => Db,
) {
  if (session.activeOrganizationId) return { data: session };
  const db = getDb();
  const firstMember = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, session.userId))
    .orderBy(asc(member.createdAt))
    .limit(1)
    .get();
  if (!firstMember) return { data: session };
  return {
    data: {
      ...session,
      activeOrganizationId: firstMember.organizationId,
    },
  };
}

/**
 * better-auth database hooks for org auto-provision on signup and active-org seeding.
 */
export function buildOrgDatabaseHooks(getDb: () => Db, getAuth: () => AuthLike) {
  return {
    user: {
      create: {
        after: (user: { id: string; email: string; name?: string | null }) =>
          provisionOrgOnSignup(user, getDb, getAuth),
      },
    },
    session: {
      create: {
        before: (session: { userId: string; activeOrganizationId?: string | null }) =>
          seedActiveOrganization(session, getDb),
      },
    },
  };
}

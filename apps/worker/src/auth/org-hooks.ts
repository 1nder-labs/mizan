import { and, asc, eq, gt } from "drizzle-orm";
import { invitations, members, type Db } from "@mizan/db";
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
 * Invited signups join the inviter's org; the invitations row is marked
 * accepted to keep it single-use (better-auth exposes no server-only accept
 * endpoint — `addMember` adds the membership and the status flip consumes the
 * invitations). Un-invited signups with `signupKind === "client"` join the
 * single designated review org as `client` members (the portal self-signup
 * path); every other un-invited signup creates its own admin org (the
 * internal default, preserving the existing bootstrap).
 *
 * `signupKind` IS a client-supplied field (better-auth `input: true`, set by
 * the portal signup form) — but it is NOT privilege-bearing. It only routes
 * between joining the single review org as `client` (the lowest role) and
 * creating one's OWN fresh, empty admin org (the pre-portal default; signup has
 * always done `createOrganization`, the portal merely narrowed it). It can
 * never place a user in an EXISTING org or grant a role in one: that path is
 * gated solely on a matching `invitations` row (a server-side DB lookup), not
 * on `signupKind`. A forged value therefore yields at most an isolated empty
 * workspace, never review-org or cross-tenant reach. The role + org assigned
 * per branch here are the security boundary; `signupKind` only selects which
 * self-signup shape runs.
 */
async function provisionOrgOnSignup(
  user: { id: string; email: string; name?: string | null; signupKind?: string | null },
  getDb: () => Db,
  getAuth: () => AuthLike,
  getReviewOrgId: () => string,
): Promise<void> {
  const db = getDb();
  const api = getOrganizationInvitationApi(getAuth());
  const pending = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.email, user.email.toLowerCase()),
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date(Date.now())),
      ),
    )
    .orderBy(asc(invitations.createdAt))
    .get();
  if (pending) {
    await api.addMember({
      body: { userId: user.id, organizationId: pending.organizationId, role: pending.role },
    });
    await db.update(invitations).set({ status: "accepted" }).where(eq(invitations.id, pending.id));
    return;
  }
  if (user.signupKind === "client") {
    await api.addMember({
      body: { userId: user.id, organizationId: getReviewOrgId(), role: "client" },
    });
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
    .select({ organizationId: members.organizationId })
    .from(members)
    .where(eq(members.userId, session.userId))
    .orderBy(asc(members.createdAt))
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
export function buildOrgDatabaseHooks(
  getDb: () => Db,
  getAuth: () => AuthLike,
  getReviewOrgId: () => string,
) {
  return {
    user: {
      create: {
        after: async (user: {
          id: string;
          email: string;
          name?: string | null;
          signupKind?: string | null;
        }) => {
          try {
            await provisionOrgOnSignup(user, getDb, getAuth, getReviewOrgId);
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.error(
              `[signup] org provisioning failed for user ${user.id} (${user.email}): ${reason}`,
            );
            throw error;
          }
        },
      },
    },
    session: {
      create: {
        before: async (session: { userId: string; activeOrganizationId?: string | null }) => {
          try {
            return await seedActiveOrganization(session, getDb);
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.error(`[signup] active-org seed failed for user ${session.userId}: ${reason}`);
            return { data: session };
          }
        },
      },
    },
  };
}

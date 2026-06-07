import { asc, eq } from "drizzle-orm";
import { makeDb, members } from "@mizan/db";
import { getOrganizationInvitationApi, type AuthLike } from "./org-invitations.ts";
import { readActiveOrganizationId } from "./session-utils.ts";
import type { CloudflareBindings } from "../env.ts";

interface BackfillSession {
  readonly session: { readonly id: string; readonly userId: string };
  readonly user: { readonly id: string };
}

/**
 * Resolves the caller's active organization, lazily backfilling it when the
 * session row carries none.
 *
 * The session better-auth mints during `signUpEmail` (auto sign-in) is created
 * before the org-membership write from `user.create.after` is visible to the
 * `session.create.before` hook, so it starts with a null active org for every
 * role (better-auth's documented default is null until a hook sets it). This
 * heals such sessions on the first authenticated request: the user's earliest
 * membership is persisted onto the session via the org plugin's
 * `setActiveOrganization`, so `requireRole` and `/api/me` converge without a
 * re-login. Sessions that already carry an active org are returned untouched,
 * so the backfill runs at most once per session.
 */
export async function resolveActiveOrgId(
  env: CloudflareBindings,
  auth: AuthLike,
  headers: Headers,
  session: BackfillSession,
): Promise<string | null> {
  const existing = readActiveOrganizationId(session.session);
  if (existing) return existing;
  const first = await makeDb(env.DB)
    .select({ organizationId: members.organizationId })
    .from(members)
    .where(eq(members.userId, session.user.id))
    .orderBy(asc(members.createdAt))
    .limit(1)
    .get();
  if (!first) return null;
  await getOrganizationInvitationApi(auth).setActiveOrganization({
    headers,
    body: { organizationId: first.organizationId },
  });
  return first.organizationId;
}

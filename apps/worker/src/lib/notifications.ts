import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { cases, members, notifications, executeEmit, type Db } from "@mizan/db";
import type { Notification, NotificationType, ViewerContext } from "@mizan/shared";

const LIST_LIMIT = 50;

interface NotifyInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly type: NotificationType;
  readonly caseId: string | null;
  readonly title: string;
  readonly body: string;
}

const EXCERPT_MAX = 140;

/** Trims free text for a notification body so the list stays scannable. */
export function excerpt(text: string): string {
  return text.length <= EXCERPT_MAX ? text : `${text.slice(0, EXCERPT_MAX - 1)}…`;
}

interface CaseNotice {
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
}

interface CaseTarget {
  readonly createdBy: string;
  readonly assignedTo: string | null;
  readonly organizationId: string;
}

async function caseTargets(db: Db, caseId: string): Promise<CaseTarget | null> {
  try {
    const row = await db
      .select({
        createdBy: cases.created_by,
        assignedTo: cases.assigned_to,
        organizationId: cases.organization_id,
      })
      .from(cases)
      .where(eq(cases.id, caseId))
      .get();
    return row ?? null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[notifications] caseTargets failed (case=${caseId}): ${reason}`);
    return null;
  }
}

/** Notifies the campaign's client (its creator), skipping self-authored actions. */
export async function notifyCaseClient(
  db: Db,
  caseId: string,
  actorUserId: string,
  notice: CaseNotice,
): Promise<void> {
  const target = await caseTargets(db, caseId);
  if (!target || target.createdBy === actorUserId) return;
  await notifyUser(db, {
    userId: target.createdBy,
    organizationId: target.organizationId,
    caseId,
    ...notice,
  });
}

async function orgAdminIds(db: Db, organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: members.userId })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.role, "admin")))
    .all();
  return rows.map((r) => r.userId);
}

/**
 * Relays an internal (reviewer/admin-private) note across the admin<->reviewer
 * side of the case: every org admin plus the case's assigned reviewer, minus the
 * author. Never reaches the client — internal notes carry `internal` visibility,
 * and the client role is not in the recipient set. Best-effort.
 */
export async function notifyInternalNote(
  db: Db,
  caseId: string,
  author: ViewerContext,
  body: string,
): Promise<void> {
  try {
    const target = await caseTargets(db, caseId);
    const recipients = new Set<string>(await orgAdminIds(db, author.organizationId));
    if (target?.assignedTo) recipients.add(target.assignedTo);
    recipients.delete(author.userId);
    for (const userId of recipients) {
      await notifyUser(db, {
        userId,
        organizationId: author.organizationId,
        caseId,
        type: "message",
        title: "Internal note added",
        body: excerpt(body),
      });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[notifications] internal note relay failed (case=${caseId}): ${reason}`);
  }
}

/**
 * Notifies the case's assigned reviewer, skipping self-authored actions. An
 * UNASSIGNED case has no targeted reviewer — the queue's existing
 * "client responded" flag covers that, so no per-reviewer row is written (an
 * org-wide fan-out would mean one row per reviewer per event).
 */
export async function notifyCaseReviewer(
  db: Db,
  caseId: string,
  actorUserId: string,
  notice: CaseNotice,
): Promise<void> {
  const target = await caseTargets(db, caseId);
  if (!target || target.assignedTo === null || target.assignedTo === actorUserId) return;
  await notifyUser(db, {
    userId: target.assignedTo,
    organizationId: target.organizationId,
    caseId,
    ...notice,
  });
}

/**
 * Writes one notification for a user and pushes a `notification.new` live event
 * on that user's SSE topic so an open client/reviewer tab refreshes its list.
 * Best-effort: a notification is a side-channel, never the primary action, so a
 * failure here is logged at this single seam rather than failing the caller's
 * write (mirrors `attachEvidenceNote`).
 */
export async function notifyUser(db: Db, input: NotifyInput): Promise<void> {
  try {
    const id = crypto.randomUUID();
    await db.insert(notifications).values({
      id,
      user_id: input.userId,
      organization_id: input.organizationId,
      type: input.type,
      case_id: input.caseId,
      title: input.title,
      body: input.body,
    });
    await executeEmit(db, {
      topic: `user:${input.userId}`,
      eventType: "notification.new",
      payload: { event_type: "notification.new", notification_id: id, user_id: input.userId },
      organizationId: input.organizationId,
      actorUserId: null,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[notifications] notify failed (user=${input.userId}): ${reason}`);
  }
}

/** Lists a viewer's most recent notifications plus their unread count. */
export async function listNotifications(
  db: Db,
  viewer: ViewerContext,
): Promise<{ notifications: Notification[]; unread: number }> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      caseId: notifications.case_id,
      title: notifications.title,
      body: notifications.body,
      readAt: notifications.read_at,
      createdAt: notifications.created_at,
      caseTitle: cases.title,
    })
    .from(notifications)
    .leftJoin(cases, eq(cases.id, notifications.case_id))
    .where(eq(notifications.user_id, viewer.userId))
    .orderBy(desc(notifications.created_at))
    .limit(LIST_LIMIT)
    .all();
  const unread = await countUnread(db, viewer.userId);
  return {
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      caseId: r.caseId,
      caseTitle: r.caseTitle ?? null,
      title: r.title,
      body: r.body,
      read: r.readAt !== null,
      createdAt: r.createdAt.getTime(),
    })),
    unread,
  };
}

/** Counts a user's unread notifications. */
export async function countUnread(db: Db, userId: string): Promise<number> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)))
    .get();
  return row?.count ?? 0;
}

/** Marks one of a viewer's notifications read (no-op if already read or not theirs). */
export async function markNotificationRead(
  db: Db,
  viewer: ViewerContext,
  id: string,
): Promise<number> {
  await db
    .update(notifications)
    .set({ read_at: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.user_id, viewer.userId),
        isNull(notifications.read_at),
      ),
    )
    .run();
  return countUnread(db, viewer.userId);
}

/** Marks all of a viewer's unread notifications read. */
export async function markAllNotificationsRead(db: Db, viewer: ViewerContext): Promise<number> {
  await db
    .update(notifications)
    .set({ read_at: new Date() })
    .where(and(eq(notifications.user_id, viewer.userId), isNull(notifications.read_at)))
    .run();
  return 0;
}

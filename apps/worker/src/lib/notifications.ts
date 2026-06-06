import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { cases, notifications, executeEmit, type Db } from "@mizan/db";
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

async function caseTargets(
  db: Db,
  caseId: string,
): Promise<{ createdBy: string; assignedTo: string | null; organizationId: string } | null> {
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
    return row
      ? { createdBy: row.createdBy, assignedTo: row.assignedTo, organizationId: row.organizationId }
      : null;
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
    .select()
    .from(notifications)
    .where(eq(notifications.user_id, viewer.userId))
    .orderBy(desc(notifications.created_at))
    .limit(LIST_LIMIT)
    .all();
  const unread = await countUnread(db, viewer.userId);
  return {
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      caseId: r.case_id,
      title: r.title,
      body: r.body,
      read: r.read_at !== null,
      createdAt: r.created_at.getTime(),
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

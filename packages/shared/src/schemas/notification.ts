import { z } from "zod";

/** Notification kind — drives the list icon only; human text is rendered server-side. */
export const NotificationTypeEnum = z.enum(["message", "evidence", "status"]);
export type NotificationType = z.infer<typeof NotificationTypeEnum>;

/** Wire shape of one notification. `createdAt` is epoch ms; `read` collapses `read_at`. */
export const NotificationSchema = z
  .object({
    id: z.string(),
    type: NotificationTypeEnum,
    caseId: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    read: z.boolean(),
    createdAt: z.number(),
  })
  .strict();
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationsResponseSchema = z
  .object({
    notifications: z.array(NotificationSchema),
    unread: z.number().int().nonnegative(),
  })
  .strict();
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;

export const MarkReadResponseSchema = z
  .object({ ok: z.literal(true), unread: z.number().int().nonnegative() })
  .strict();
export type MarkReadResponse = z.infer<typeof MarkReadResponseSchema>;

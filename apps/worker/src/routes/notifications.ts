import { zValidator } from "@hono/zod-validator";
import { makeDb } from "@mizan/db";
import { MarkReadResponseSchema, NotificationsResponseSchema } from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { requireRole, type ViewerVariables } from "../middleware/require-role.ts";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../lib/notifications.ts";

const IdParamSchema = z.object({ id: z.string().min(1) });

/**
 * Per-user notification feed (`/api/notifications`). Open to every authenticated
 * role — reviewers, admins, and clients share one feed scoped to `user_id =
 * self` (the lib never widens past the session user). Reads list the latest
 * notifications + unread count; the two write routes stamp `read_at`.
 */
export const notificationRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .use("*", requireRole(["client", "reviewer", "admin"]))
  .get("/", async (c) => {
    const data = await listNotifications(makeDb(c.env.DB), c.var.viewer);
    return c.json(NotificationsResponseSchema.parse(data));
  })
  .post("/read-all", async (c) => {
    const unread = await markAllNotificationsRead(makeDb(c.env.DB), c.var.viewer);
    return c.json(MarkReadResponseSchema.parse({ ok: true, unread }));
  })
  .post("/:id/read", zValidator("param", IdParamSchema), async (c) => {
    const unread = await markNotificationRead(
      makeDb(c.env.DB),
      c.var.viewer,
      c.req.valid("param").id,
    );
    return c.json(MarkReadResponseSchema.parse({ ok: true, unread }));
  });

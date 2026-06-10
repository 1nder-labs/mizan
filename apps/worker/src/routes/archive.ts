/**
 * Manual archive / unarchive for a case. Archiving drops the case off the active
 * queue (it reappears only under the Archived filter) without deleting history;
 * unarchiving restores it. BLOCK auto-archives via the action chain — this route
 * is the reviewer's manual control for every other case. Mounted inside
 * `caseRoutes` after `requireCaseAccess`, so `:id` is already org-scoped + access
 * checked; the UPDATE re-scopes to the org as defense in depth.
 */
import { zValidator } from "@hono/zod-validator";
import { and, buildArchivedEmits, cases, emitLiveEventsBestEffort, eq, makeDb } from "@mizan/db";
import { ArchiveResponseSchema } from "@mizan/shared";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";

const ParamIdSchema = z.object({ id: z.string().uuid() });

type ArchiveContext = Context<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>;

/** Sets or clears `archived_at` for an org-scoped case and echoes the new state. */
async function setArchived(c: ArchiveContext, id: string, archived: boolean): Promise<Response> {
  const db = makeDb(c.env.DB);
  const viewer = c.var.viewer;
  const updated = await db
    .update(cases)
    .set({ archived_at: archived ? new Date() : null })
    .where(and(eq(cases.id, id), eq(cases.organization_id, viewer.organizationId)))
    .returning({ id: cases.id });
  if (updated.length === 0) return c.json({ error: "not_found" }, 404);
  await emitLiveEventsBestEffort(
    db,
    buildArchivedEmits({
      caseId: id,
      organizationId: viewer.organizationId,
      archived,
      actorUserId: viewer.userId,
    }),
  );
  return c.json(ArchiveResponseSchema.parse({ archived }));
}

export const archiveRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .post("/:id/archive", zValidator("param", ParamIdSchema), (c) =>
    setArchived(c, c.req.valid("param").id, true),
  )
  .post("/:id/unarchive", zValidator("param", ParamIdSchema), (c) =>
    setArchived(c, c.req.valid("param").id, false),
  );

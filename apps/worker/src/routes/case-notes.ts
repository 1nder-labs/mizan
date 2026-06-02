import { zValidator } from "@hono/zod-validator";
import { makeDb, type Db } from "@mizan/db";
import {
  CaseNotesResponseSchema,
  NoteCreateSchema,
  type NoteVisibility,
  type ViewerContext,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { caseInViewerOrg, readCaseNotes, writeCaseNote } from "../lib/case-notes.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";

const NoteParamSchema = z.object({ id: z.string().uuid() });

/** Writes a reviewer/admin-authored note; author role comes from the session. */
function persistReviewerNote(
  db: Db,
  viewer: ViewerContext,
  caseId: string,
  body: string,
  visibility: NoteVisibility,
): Promise<void> {
  return writeCaseNote(db, {
    caseId,
    organizationId: viewer.organizationId,
    authorUserId: viewer.userId,
    authorRole: viewer.role,
    visibility,
    body,
  });
}

/**
 * Reviewer-side case notes (mounted under /api/cases, gated reviewer/admin by
 * the parent route group). The endpoint encodes visibility — `/message` is
 * client_facing, `/internal` is internal — so a reviewer never supplies
 * visibility in the body. Every read + write org-scopes the case first, so a
 * reviewer in one org can neither read nor note a case in another (404).
 */
export const caseNotesRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .get("/:id/notes", zValidator("param", NoteParamSchema), async (c) => {
    const db = makeDb(c.env.DB);
    const { id } = c.req.valid("param");
    if (!(await caseInViewerOrg(db, id, c.var.viewer.organizationId)))
      return c.json({ error: "not_found" }, 404);
    const notes = await readCaseNotes(db, c.var.viewer, id);
    return c.json(CaseNotesResponseSchema.parse({ notes }));
  })
  .post(
    "/:id/notes/message",
    zValidator("param", NoteParamSchema),
    zValidator("json", NoteCreateSchema),
    async (c) => {
      const db = makeDb(c.env.DB);
      const { id } = c.req.valid("param");
      if (!(await caseInViewerOrg(db, id, c.var.viewer.organizationId)))
        return c.json({ error: "not_found" }, 404);
      await persistReviewerNote(db, c.var.viewer, id, c.req.valid("json").body, "client_facing");
      return c.json({ ok: true }, 201);
    },
  )
  .post(
    "/:id/notes/internal",
    zValidator("param", NoteParamSchema),
    zValidator("json", NoteCreateSchema),
    async (c) => {
      const db = makeDb(c.env.DB);
      const { id } = c.req.valid("param");
      if (!(await caseInViewerOrg(db, id, c.var.viewer.organizationId)))
        return c.json({ error: "not_found" }, 404);
      await persistReviewerNote(db, c.var.viewer, id, c.req.valid("json").body, "internal");
      return c.json({ ok: true }, 201);
    },
  );

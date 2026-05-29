/**
 * Queue-list + case-detail read handlers (thin wrappers over cases-handler).
 */
import { zValidator } from "@hono/zod-validator";
import { makeDb } from "@mizan/db";
import { CaseDetailResponseSchema, QueueResponseSchema, QueueSearchSchema } from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { fetchCaseDetail, listCasesForViewer } from "../handlers/cases-handler.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";

const ParamIdSchema = z.object({ id: z.string().uuid() });

export const casesListRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .get("/", zValidator("query", QueueSearchSchema), async (c) => {
    const search = c.req.valid("query");
    const db = makeDb(c.env.DB);
    const payload = QueueResponseSchema.parse(await listCasesForViewer(search, c.var.viewer, db));
    return c.json(payload);
  })
  .get("/:id", zValidator("param", ParamIdSchema), async (c) => {
    const { id } = c.req.valid("param");
    const db = makeDb(c.env.DB);
    const payload = await fetchCaseDetail(id, c.var.viewer, db);
    if (!payload) return c.json({ error: "not_found" }, 404);
    return c.json(CaseDetailResponseSchema.parse(payload));
  });

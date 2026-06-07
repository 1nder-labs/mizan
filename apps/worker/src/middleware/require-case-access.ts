/**
 * Per-case RBAC gate. Admin/owner have full org access; a reviewer may only
 * touch cases ASSIGNED to them. Mounted on every `/:id` + `/:id/*` reviewer
 * route so the boundary lives in one place rather than scattered across each
 * handler's query. Runs after `requireRole` (which sets `c.var.viewer`).
 *
 * 404 when the case is outside the viewer's org (no cross-tenant existence
 * leak); 403 when a reviewer is not the assignee.
 */
import { createMiddleware } from "hono/factory";
import { and, cases, eq, makeDb } from "@mizan/db";
import type { CloudflareBindings } from "../env.ts";
import type { ViewerVariables } from "./require-role.ts";

export const requireCaseAccess = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>(async (c, next) => {
  const caseId = c.req.param("id");
  if (!caseId) return c.json({ error: "not_found" }, 404);
  const viewer = c.var.viewer;
  const row = await makeDb(c.env.DB)
    .select({ assigned_to: cases.assigned_to })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.organization_id, viewer.organizationId)))
    .get();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (viewer.role !== "admin" && row.assigned_to !== viewer.userId) {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
  return;
});

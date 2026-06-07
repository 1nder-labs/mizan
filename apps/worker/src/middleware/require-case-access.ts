/**
 * Per-case RBAC gate. The `admin` role has full access to every case in its
 * organization; a `reviewer` may only touch cases ASSIGNED to them. Mounted on
 * the data `/:id` + `/:id/*` reviewer routes so the boundary lives in one place
 * rather than scattered across each handler's query. Runs after `requireRole`
 * (which sets `c.var.viewer`).
 *
 * The case id is validated as a UUID first: a malformed id is a client error
 * (`400`) and cannot reference any real case, so the gate rejects it before the
 * org lookup. This preserves the documented `400`-on-non-UUID contract of the
 * `:id` routes whose own `zValidator("param", …)` runs only after this gate.
 *
 * `404` when the case is outside the viewer's org (no cross-tenant existence
 * leak); `403` when a reviewer is not the assignee.
 *
 * `POST /:id/assign` is deliberately NOT behind this gate — self-claiming an
 * UNASSIGNED case is the queue's core flow, which "reviewer may only touch
 * assigned cases" would 403. The assign route enforces its own finer
 * `self_assign_only` + org-scope policy. The exemption is realised by route
 * registration order in `routes/cases.ts` (see the ordering invariant there).
 */
import { createMiddleware } from "hono/factory";
import { and, cases, eq, makeDb } from "@mizan/db";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import type { ViewerVariables } from "./require-role.ts";

const CaseIdSchema = z.string().uuid();

export const requireCaseAccess = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>(async (c, next) => {
  const parsed = CaseIdSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return c.json({ error: "invalid_case_id" }, 400);
  const caseId = parsed.data;
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

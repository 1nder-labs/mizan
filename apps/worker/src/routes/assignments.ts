/**
 * Phase 7.6 U3 — case assignment route.
 *
 * `POST /api/cases/:id/assign { user_id: string | null }`
 *
 * Permission rules:
 *   - admin: assign or unassign any case to/from any user (or null).
 *   - reviewer: may only claim an unassigned case (self-assign), and may
 *     only unassign a case that they themselves currently hold.
 *
 * Returns 200 with the canonical `{case_id, assigned_to}` on success.
 */
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { cases, makeDb, users, type Db } from "@mizan/db";
import {
  CaseAssignErrorBodySchema,
  CaseAssignRequestSchema,
  CaseAssignResponseSchema,
  type CaseAssignErrorCode,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import type { RoleVariables } from "../middleware/require-role.ts";

const ParamIdSchema = z.object({ id: z.string().uuid() });

function assignError(code: CaseAssignErrorCode): { error: CaseAssignErrorCode } {
  return CaseAssignErrorBodySchema.parse({ error: code });
}

async function loadCase(db: Db, caseId: string) {
  return db
    .select({ id: cases.id, assigned_to: cases.assigned_to })
    .from(cases)
    .where(eq(cases.id, caseId))
    .get();
}

async function userExists(db: Db, userId: string): Promise<boolean> {
  const row = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
  return Boolean(row);
}

function canReviewerMutate(
  currentAssignment: string | null,
  nextAssignment: string | null,
  viewerId: string,
): CaseAssignErrorCode | null {
  if (nextAssignment === null) {
    return currentAssignment === viewerId ? null : "self_assign_only";
  }
  if (currentAssignment !== null) return "self_assign_only";
  return nextAssignment === viewerId ? null : "self_assign_only";
}

export const assignmentsRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: RoleVariables;
}>().post(
  "/:id/assign",
  zValidator("param", ParamIdSchema),
  zValidator("json", CaseAssignRequestSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { user_id: nextAssignment } = c.req.valid("json");
    const db = makeDb(c.env.DB);
    const row = await loadCase(db, id);
    if (!row) return c.json(assignError("not_found"), 404);
    const viewer = c.var.user;
    if (viewer.role === "reviewer") {
      const denial = canReviewerMutate(row.assigned_to, nextAssignment, viewer.id);
      if (denial) return c.json(assignError(denial), 403);
    }
    if (nextAssignment && !(await userExists(db, nextAssignment))) {
      return c.json(assignError("invalid_user"), 400);
    }
    await db
      .update(cases)
      .set({ assigned_to: nextAssignment, updated_at: new Date() })
      .where(eq(cases.id, id));
    const body = CaseAssignResponseSchema.parse({ case_id: id, assigned_to: nextAssignment });
    return c.json(body);
  },
);

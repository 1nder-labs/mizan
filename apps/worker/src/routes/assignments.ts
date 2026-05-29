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
import { and, eq } from "drizzle-orm";
import {
  buildAssignmentEmits,
  cases,
  emitLiveEvent,
  makeDb,
  members,
  users,
  type Db,
} from "@mizan/db";
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

async function loadCase(db: Db, caseId: string, organizationId: string) {
  return db
    .select({
      id: cases.id,
      assigned_to: cases.assigned_to,
      organization_id: cases.organization_id,
    })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.organization_id, organizationId)))
    .get();
}

/**
 * A user is assignable only when they hold a membership in the same
 * organization as the case. A bare `users` existence check would let an
 * admin assign a case to a members of a different organization.
 */
async function isOrgMember(db: Db, userId: string, organizationId: string): Promise<boolean> {
  const row = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.organizationId, organizationId)))
    .get();
  return Boolean(row);
}

async function loadActorEmail(db: Db, userId: string): Promise<string> {
  const row = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).get();
  if (!row?.email) throw new Error(`assignment: actor email missing for user ${userId}`);
  return row.email;
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
    const viewer = c.var.viewer;
    const row = await loadCase(db, id, viewer.organizationId);
    if (!row) return c.json(assignError("not_found"), 404);
    if (viewer.role === "reviewer") {
      const denial = canReviewerMutate(row.assigned_to, nextAssignment, viewer.userId);
      if (denial) return c.json(assignError(denial), 403);
    }
    if (nextAssignment && !(await isOrgMember(db, nextAssignment, viewer.organizationId))) {
      return c.json(assignError("invalid_user"), 400);
    }
    const actorEmail = await loadActorEmail(db, viewer.userId);
    const emits = buildAssignmentEmits({
      caseId: id,
      organizationId: row.organization_id,
      previousAssignee: row.assigned_to,
      nextAssignee: nextAssignment,
      actorUserId: viewer.userId,
      actorEmail,
    });
    const updateStmt = db
      .update(cases)
      .set({ assigned_to: nextAssignment, updated_at: new Date() })
      .where(and(eq(cases.id, id), eq(cases.organization_id, viewer.organizationId)));
    const emitStmts = emits.map((emit) => emitLiveEvent(db, emit));
    await db.batch([updateStmt, ...emitStmts]);
    const body = CaseAssignResponseSchema.parse({ case_id: id, assigned_to: nextAssignment });
    return c.json(body);
  },
);

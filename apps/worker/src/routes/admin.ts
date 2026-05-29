/**
 * Admin-gated routes mounted at `/api/admin`.
 *
 * All routes in this sub-router are protected by `requireRole("admin")`.
 * The `RoleVariables` type (which extends `AuthVariables`) ensures that
 * both `c.var.auth` (set by the global `authInit`) and `c.var.user`
 * (set by `requireRole`) are fully typed on every handler below.
 *
 * Middleware order on `POST /echo`:
 * 1. `requireRole("admin")` — session + role gate (set via `.use("*", ...)`)
 * 2. `idempotencyKey` — KV-backed replay protection
 * 3. `zValidator("json", EchoSchema)` — request body validation
 * 4. handler — returns echoed payload with server timestamp
 */

import { zValidator } from "@hono/zod-validator";
import { makeDb } from "@mizan/db";
import { AuditListResponseSchema, AuditListSearchSchema, EchoSchema } from "@mizan/shared";
import { Hono } from "hono";
import type { CloudflareBindings } from "../env.ts";
import { listAuditPage, ForbiddenError } from "../handlers/read-handlers.ts";
import { idempotencyKey } from "../middleware/idempotency-key.ts";
import { requireRole, type ViewerVariables } from "../middleware/require-role.ts";

export const adminRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .use("*", requireRole("admin"))
  .get("/ping", (c) => c.json({ ok: true }))
  .get("/audit", zValidator("query", AuditListSearchSchema), async (c) => {
    const search = c.req.valid("query");
    const db = makeDb(c.env.DB);
    try {
      const { entries, total } = await listAuditPage(search, c.var.viewer, db);
      const payload = AuditListResponseSchema.parse({
        entries: entries.map((entry) => ({
          id: entry.id,
          case_id: entry.case_id,
          case_status: entry.case_status,
          case_category: entry.case_category,
          reviewer_email: entry.reviewer_email,
          action: entry.action,
          rationale: entry.rationale,
          acted_at: entry.acted_at.getTime(),
        })),
        page: search.page,
        page_size: search.page_size,
        total,
      });
      return c.json(payload);
    } catch (error) {
      if (error instanceof ForbiddenError) return c.json({ error: "Forbidden" }, 403);
      throw error;
    }
  })
  .post("/echo", idempotencyKey, zValidator("json", EchoSchema), (c) => {
    const { message, action_id } = c.req.valid("json");
    return c.json({ message, action_id, echoedAt: Date.now() });
  });

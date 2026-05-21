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
import { Hono } from "hono";
import { EchoSchema } from "@mizan/db";
import type { CloudflareBindings } from "../env.ts";
import { idempotencyKey } from "../middleware/idempotency-key.ts";
import { requireRole, type RoleVariables } from "../middleware/require-role.ts";

export const adminRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: RoleVariables;
}>()
  .use("*", requireRole("admin"))
  .get("/ping", (c) => c.json({ ok: true }))
  .post(
    "/echo",
    idempotencyKey,
    zValidator("json", EchoSchema),
    (c) => {
      const { message, action_id } = c.req.valid("json");
      return c.json({ message, action_id, echoedAt: Date.now() });
    },
  );

import { z } from "zod";

/**
 * Single source of truth for Mizan's member roles. The viewer/team/me zod
 * enums, the worker's `Role` type, and the `members.role` / `invitations.role`
 * drizzle columns (`@mizan/db`) all derive from `ROLE_VALUES`, so a new role
 * widens in exactly one place. `@mizan/db` depends on `@mizan/shared` (one-way),
 * so this lives in shared with no import cycle.
 *
 * Order matches the `members.role` drizzle column so referencing `ROLE_VALUES`
 * from the schema produces an identical enum (no spurious migration). Order is
 * irrelevant to validation and to the inferred union type.
 */
export const ROLE_VALUES = ["admin", "reviewer", "client"] as const;
export const RoleEnum = z.enum(ROLE_VALUES);
export type Role = z.infer<typeof RoleEnum>;

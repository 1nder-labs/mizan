import { z } from "zod";

/**
 * HTTP route validation schemas for Hono endpoints.
 *
 * Lives in `@mizan/shared` (not `@mizan/db`) because route payloads are
 * the API surface contract — clients consume them, the worker validates
 * them. Coupling them to the Drizzle `reviewer_actions` table would tie
 * the public API shape to internal storage, which the two are not
 * obligated to share.
 *
 * The `action` enum is sourced from a single tuple of literals shared
 * with the Drizzle column declaration so the runtime validator and the
 * column constraint cannot drift.
 */

const uuid = z.string().uuid();

/**
 * Reviewer-action enum values shared between the Drizzle column
 * (`reviewer_actions.action`) and the HTTP route validator below.
 * Mirrors `REVIEWER_ACTION_VALUES` in `@mizan/db/schema.ts`. Keeping
 * the literal tuple in two places is intentional: `@mizan/shared`
 * cannot import from `@mizan/db` without inverting the layering, so
 * this constant is the canonical copy and the test
 * `apps/worker/tests/unit/db-schemas.test.ts` pins parity at CI.
 */
export const REVIEWER_ACTION_ENUM = [
  "APPROVE",
  "ESCALATE",
  "REQUEST_DOCS",
  "BLOCK",
  "OVERRIDE",
] as const;

/**
 * Shape of the reviewer-action POST body for `/api/cases/:id/action`.
 * Decoupled from `selectReviewerActionsSchema` because the public
 * payload is a subset — only the three fields a reviewer submits.
 */
export const ReviewerActionSchema = z.object({
  action: z.enum(REVIEWER_ACTION_ENUM),
  rationale: z.string().min(1).max(2000),
  action_id: uuid,
});

export type ReviewerActionPayload = z.infer<typeof ReviewerActionSchema>;

/** Request body for the admin echo endpoint (`/api/admin/echo`). */
export const EchoSchema = z.object({
  message: z.string().min(1).max(500),
  action_id: uuid,
});

export type EchoPayload = z.infer<typeof EchoSchema>;

import { z } from "zod";

/**
 * Discriminator for `POST /api/cases/:id/action` error responses.
 * Web clients should switch on these codes — never string-match
 * `error.message`.
 */
export const ActionErrorCodeEnum = z.enum([
  "not_found",
  "no_run",
  "not_suspended_or_claimed",
  "workflow_failed",
]);

export type ActionErrorCode = z.infer<typeof ActionErrorCodeEnum>;

export const ActionErrorBodySchema = z
  .object({
    error: ActionErrorCodeEnum,
  })
  .strict();

export type ActionErrorBody = z.infer<typeof ActionErrorBodySchema>;

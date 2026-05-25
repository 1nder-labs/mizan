import { z } from "zod";
import {
  ReviewerActionEnum,
  ReviewerActionRequestSchema,
  type ReviewerAction,
  type ReviewerActionRequest,
} from "./reviewer-action.ts";

/**
 * HTTP route validation schemas for Hono endpoints.
 *
 * Lives in `@mizan/shared` (not `@mizan/db`) because route payloads are
 * the API surface contract — clients consume them, the worker validates
 * them. Coupling them to the Drizzle `reviewer_actions` table would tie
 * the public API shape to internal storage, which the two are not
 * obligated to share.
 */

const uuid = z.string().uuid();

/** @deprecated alias — prefer `ReviewerActionEnum` from `./reviewer-action.ts`. */
export const REVIEWER_ACTION_ENUM = ReviewerActionEnum.options;

/** Alias for Phase 7 `ReviewerActionRequestSchema`. */
export const ReviewerActionSchema = ReviewerActionRequestSchema;

export type ReviewerActionPayload = ReviewerActionRequest;

export type { ReviewerAction, ReviewerActionRequest };

/** Request body for the admin echo endpoint (`/api/admin/echo`). */
export const EchoSchema = z.object({
  message: z.string().min(1).max(500),
  action_id: uuid,
});

export type EchoPayload = z.infer<typeof EchoSchema>;

import { z } from "zod";
import { BriefPayloadSchema } from "./brief.ts";

const uuid = z.string().uuid();
const RATIONALE_MAX = 2_000;
const RATIONALE_MIN_REQUIRED = 8;

/**
 * Reviewer-action enum values shared between the Drizzle column
 * (`reviewer_actions.action`) and HTTP route validation. Mirrors
 * `REVIEWER_ACTION_VALUES` in `@mizan/db/schema.ts`; parity is
 * pinned by `apps/worker/tests/unit/db-schemas.test.ts`.
 */
export const ReviewerActionEnum = z.enum([
  "APPROVE",
  "ESCALATE",
  "REQUEST_DOCS",
  "BLOCK",
  "OVERRIDE",
]);

export type ReviewerAction = z.infer<typeof ReviewerActionEnum>;

const RATIONALE_REQUIRED_ACTIONS = new Set<ReviewerAction>(["OVERRIDE", "BLOCK"]);

/**
 * POST `/api/cases/:id/action` request body. Rationale is optional
 * for most actions but required (≥ 8 chars) for OVERRIDE and BLOCK,
 * and capped at 2_000 chars to bound DB + KV write size.
 */
export const ReviewerActionRequestSchema = z
  .object({
    action: ReviewerActionEnum,
    rationale: z.string().trim().max(RATIONALE_MAX),
    action_id: uuid,
  })
  .superRefine((value, ctx) => {
    if (!RATIONALE_REQUIRED_ACTIONS.has(value.action)) return;
    if (value.rationale.length >= RATIONALE_MIN_REQUIRED) return;
    ctx.addIssue({
      code: "custom",
      message: "Rationale required (≥ 8 chars) for override and block",
      path: ["rationale"],
    });
  });

export type ReviewerActionRequest = z.infer<typeof ReviewerActionRequestSchema>;

/** POST `/api/cases/:id/action` success envelope. */
export const ReviewerActionResponseSchema = z.object({
  status: z.string(),
  brief: BriefPayloadSchema.nullable(),
  action: ReviewerActionRequestSchema,
});

export type ReviewerActionResponse = z.infer<typeof ReviewerActionResponseSchema>;

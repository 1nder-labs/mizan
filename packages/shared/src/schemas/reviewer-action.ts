import { z } from "zod";

const uuid = z.string().uuid();

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
 * for most actions but required (≥ 8 chars) for OVERRIDE and BLOCK.
 */
export const ReviewerActionRequestSchema = z
  .object({
    action: ReviewerActionEnum,
    rationale: z.string().trim(),
    action_id: uuid,
  })
  .superRefine((value, ctx) => {
    if (!RATIONALE_REQUIRED_ACTIONS.has(value.action)) return;
    if (value.rationale.length >= 8) return;
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
  brief: z.unknown().nullable(),
  action: ReviewerActionRequestSchema,
});

export type ReviewerActionResponse = z.infer<typeof ReviewerActionResponseSchema>;

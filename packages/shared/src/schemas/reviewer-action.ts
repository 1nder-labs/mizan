import { z } from "zod";
import { BriefPayloadSchema } from "./brief.ts";

const uuid = z.string().uuid();

/** Maximum bytes accepted for the reviewer-supplied rationale text. */
export const RATIONALE_MAX = 2_000;
/** Minimum chars required when the action mandates rationale (OVERRIDE, BLOCK). */
export const RATIONALE_MIN_REQUIRED = 8;

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

/** Actions that require a non-trivial rationale at request time. */
export const RATIONALE_REQUIRED_ACTIONS: ReadonlySet<ReviewerAction> = new Set<ReviewerAction>([
  "OVERRIDE",
  "BLOCK",
]);

const rationaleField = z.string().trim().max(RATIONALE_MAX);

function refineRationale(
  value: { action: ReviewerAction; rationale: string },
  ctx: z.RefinementCtx,
): void {
  if (!RATIONALE_REQUIRED_ACTIONS.has(value.action)) return;
  if (value.rationale.length >= RATIONALE_MIN_REQUIRED) return;
  ctx.addIssue({
    code: "custom",
    message: `Rationale required (>= ${RATIONALE_MIN_REQUIRED} chars) for override and block`,
    path: ["rationale"],
  });
}

/**
 * POST `/api/cases/:id/action` request body. Rationale is optional for
 * most actions but required (>= 8 chars) for OVERRIDE and BLOCK, and
 * capped at 2_000 chars to bound DB + KV write size.
 */
export const ReviewerActionRequestSchema = z
  .object({
    action: ReviewerActionEnum,
    rationale: rationaleField,
    action_id: uuid,
  })
  .superRefine(refineRationale);

export type ReviewerActionRequest = z.infer<typeof ReviewerActionRequestSchema>;

/**
 * Resume payload handed to the Mastra `awaitReviewerAction` step.
 * Mirrors `ReviewerActionRequestSchema` exactly so the workflow-side
 * boundary cannot drift from the HTTP boundary — both share the same
 * rationale constraint and refinement.
 */
export const ReviewerActionResumeSchema = z
  .object({
    action: ReviewerActionEnum,
    rationale: rationaleField,
    action_id: uuid,
    reviewer_id: z.string().min(1),
  })
  .superRefine(refineRationale);

export type ReviewerActionResumeData = z.infer<typeof ReviewerActionResumeSchema>;

/**
 * Status reported by Mastra `WorkflowRun.resume`. Mirrors Mastra's
 * `WorkflowResult.status` discriminator exactly (`success` | `failed`
 * | `suspended` | `paused` | `tripwire`) so the response schema cannot
 * drift if a future Mastra release adds a new status. Reviewer UI
 * switches on the discriminator instead of parsing free-form text.
 */
export const ReviewerActionResultStatusEnum = z.enum([
  "success",
  "failed",
  "suspended",
  "paused",
  "tripwire",
]);

export type ReviewerActionResultStatus = z.infer<typeof ReviewerActionResultStatusEnum>;

/** POST `/api/cases/:id/action` success envelope. */
export const ReviewerActionResponseSchema = z.object({
  status: ReviewerActionResultStatusEnum,
  brief: BriefPayloadSchema.nullable(),
  action: ReviewerActionRequestSchema,
});

export type ReviewerActionResponse = z.infer<typeof ReviewerActionResponseSchema>;

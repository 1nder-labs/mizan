import { z } from "zod";
import { ReviewerActionResumeSchema as SharedResumeSchema } from "@mizan/shared";
import { PartialBriefStateSchema } from "./partial-brief-state.ts";

/**
 * Suspend payload persisted by Mastra when the workflow halts for
 * reviewer action. Intentionally narrow — the brief body lives in the
 * `briefs` table; consumers reload by `briefId`. The route owns the
 * post-action chain (record / promote / finalize) and does NOT call
 * `run.resume()`; the resume schema below is declared for Mastra's
 * step type contract but the resume path is never executed at runtime.
 */
export const ReviewerActionSuspendSchema = z.object({
  awaiting: z.literal("reviewer_action"),
  caseId: z.string().uuid(),
  runId: z.string().uuid(),
  briefId: z.string().uuid(),
});

export type ReviewerActionSuspendPayload = z.infer<typeof ReviewerActionSuspendSchema>;

/**
 * Mastra step-contract resume schema. Shadow type only — `run.resume()`
 * is not called for this workflow on Workers (cross-request I/O
 * isolation blocks it); the action route handles the post-suspend
 * chain inline.
 */
export const ReviewerActionResumeSchema = SharedResumeSchema;
export type ReviewerActionResumeData = z.infer<typeof ReviewerActionResumeSchema>;

export const ReviewerActionStepStateSchema = PartialBriefStateSchema.extend({
  reviewerAction: ReviewerActionResumeSchema,
});

export type ReviewerActionStepState = z.infer<typeof ReviewerActionStepStateSchema>;

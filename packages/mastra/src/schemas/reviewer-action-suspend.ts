import { z } from "zod";
import { BriefPayloadSchema, ReviewerActionEnum } from "@mizan/shared";
import { PartialBriefStateSchema } from "./partial-brief-state.ts";

/** Payload persisted when the workflow suspends for reviewer action. */
export const ReviewerActionSuspendSchema = z.object({
  awaiting: z.literal("reviewer_action"),
  caseId: z.string().uuid(),
  runId: z.string().uuid(),
  briefId: z.string().uuid(),
  brief: BriefPayloadSchema,
});

export type ReviewerActionSuspendPayload = z.infer<typeof ReviewerActionSuspendSchema>;

/** Data supplied when resuming from the action endpoint. */
export const ReviewerActionResumeSchema = z.object({
  action: ReviewerActionEnum,
  rationale: z.string(),
  action_id: z.string().uuid(),
  reviewer_id: z.string().min(1),
});

export type ReviewerActionResumeData = z.infer<typeof ReviewerActionResumeSchema>;

export const ReviewerActionStepStateSchema = PartialBriefStateSchema.extend({
  reviewerAction: ReviewerActionResumeSchema,
});

export type ReviewerActionStepState = z.infer<typeof ReviewerActionStepStateSchema>;

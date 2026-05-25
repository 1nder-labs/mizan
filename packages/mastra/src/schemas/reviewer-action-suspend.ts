import { z } from "zod";
import { ReviewerActionResumeSchema as SharedResumeSchema } from "@mizan/shared";
import { PartialBriefStateSchema } from "./partial-brief-state.ts";

/**
 * Suspend payload persisted by Mastra when the workflow halts for
 * reviewer action. Intentionally narrow: the brief body lives in the
 * `briefs` table and downstream steps reload by `briefId`. Keeping the
 * payload reference-only minimises D1Store row size and prevents the
 * brief from being duplicated in workflow snapshot storage.
 */
export const ReviewerActionSuspendSchema = z.object({
  awaiting: z.literal("reviewer_action"),
  caseId: z.string().uuid(),
  runId: z.string().uuid(),
  briefId: z.string().uuid(),
});

export type ReviewerActionSuspendPayload = z.infer<typeof ReviewerActionSuspendSchema>;

/**
 * Resume payload — the shared schema is canonical (mirrors the HTTP
 * request body so rationale constraints cannot drift between
 * boundaries). Re-exported here so step code reads from a sibling.
 */
export const ReviewerActionResumeSchema = SharedResumeSchema;
export type ReviewerActionResumeData = z.infer<typeof ReviewerActionResumeSchema>;

export const ReviewerActionStepStateSchema = PartialBriefStateSchema.extend({
  reviewerAction: ReviewerActionResumeSchema,
});

export type ReviewerActionStepState = z.infer<typeof ReviewerActionStepStateSchema>;

/**
 * Drizzle-zod refinements and inferred types for all five domain tables.
 *
 * Refinements live here — NOT next to the table definitions — because
 * `drizzle-zod` expects them as the second argument to `createInsertSchema`.
 * Keeping them in this file also keeps `schema.ts` free of zod imports;
 * `schema.ts` depends only on `drizzle-orm/sqlite-core`.
 *
 * Pattern used throughout:
 * - `createSelectSchema` → full row shape (for query results)
 * - `createInsertSchema` → insert payload with column-level refinements
 * - `createUpdateSchema` → partial update payload (all fields optional)
 *
 * All refinements use the no-arg override form `() => z.string().refinement()`
 * rather than the callback form `(s) => s.refinement()`. With drizzle-zod 0.8
 * + zod 4, the TypeScript type of the callback argument resolves to
 * `ZodType<Buffer>` for SQLite text columns, making the callback form
 * unusable at the type level even though it works at runtime. The no-arg
 * override is the correct pattern for full type-safety.
 */

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import {
  briefs,
  cases,
  reviewer_actions,
  signals,
  workflow_events,
} from "./schema.ts";

const uuid = z.string().uuid();

/** --- cases --- */

export const selectCasesSchema = createSelectSchema(cases);

export const insertCasesSchema = createInsertSchema(cases, {
  category: () => z.string().min(1).max(120),
  geography: () => z.string().min(1).max(120),
  claimed_zakat_category: () => z.string().max(120).nullish(),
});

export const updateCasesSchema = createUpdateSchema(cases);

export type Case = z.infer<typeof selectCasesSchema>;
export type NewCase = z.infer<typeof insertCasesSchema>;
export type UpdateCase = z.infer<typeof updateCasesSchema>;

/** --- briefs --- */

export const selectBriefsSchema = createSelectSchema(briefs);

export const insertBriefsSchema = createInsertSchema(briefs, {
  confidence: () => z.number().int().min(0).max(100),
});

export const updateBriefsSchema = createUpdateSchema(briefs);

export type Brief = z.infer<typeof selectBriefsSchema>;
export type NewBrief = z.infer<typeof insertBriefsSchema>;
export type UpdateBrief = z.infer<typeof updateBriefsSchema>;

/** --- signals --- */

export const selectSignalsSchema = createSelectSchema(signals);

export const insertSignalsSchema = createInsertSchema(signals);

export const updateSignalsSchema = createUpdateSchema(signals);

export type Signal = z.infer<typeof selectSignalsSchema>;
export type NewSignal = z.infer<typeof insertSignalsSchema>;
export type UpdateSignal = z.infer<typeof updateSignalsSchema>;

/** --- reviewer_actions --- */

export const selectReviewerActionsSchema = createSelectSchema(reviewer_actions);

export const insertReviewerActionsSchema = createInsertSchema(
  reviewer_actions,
  {
    rationale: () => z.string().min(1).max(2000),
    action_id: () => uuid,
  },
);

export const updateReviewerActionsSchema = createUpdateSchema(reviewer_actions);

export type ReviewerAction = z.infer<typeof selectReviewerActionsSchema>;
export type NewReviewerAction = z.infer<typeof insertReviewerActionsSchema>;
export type UpdateReviewerAction = z.infer<typeof updateReviewerActionsSchema>;

/** --- workflow_events --- */

export const selectWorkflowEventsSchema = createSelectSchema(workflow_events);

export const insertWorkflowEventsSchema = createInsertSchema(workflow_events);

export const updateWorkflowEventsSchema = createUpdateSchema(workflow_events);

export type WorkflowEvent = z.infer<typeof selectWorkflowEventsSchema>;
export type NewWorkflowEvent = z.infer<typeof insertWorkflowEventsSchema>;
export type UpdateWorkflowEvent = z.infer<typeof updateWorkflowEventsSchema>;

/**
 * Shared action-payload schema used by Hono route validation (not a DB row
 * shape). Decoupled from `selectReviewerActionsSchema` because the
 * action-payload is a subset: only the three fields a reviewer submits.
 */
export const ReviewerActionSchema = z.object({
  action: z.enum([
    "APPROVE",
    "ESCALATE",
    "REQUEST_DOCS",
    "BLOCK",
    "OVERRIDE",
  ]),
  rationale: z.string().min(1).max(2000),
  action_id: uuid,
});

export type ReviewerActionPayload = z.infer<typeof ReviewerActionSchema>;

/**
 * Request body for the admin echo endpoint (`/api/admin/echo`).
 * Used in U9 route validation; defined here so `@mizan/db` is the single
 * source of truth for all validated payloads.
 */
export const EchoSchema = z.object({
  message: z.string().min(1).max(500),
  action_id: z.string().uuid(),
});

export type EchoPayload = z.infer<typeof EchoSchema>;

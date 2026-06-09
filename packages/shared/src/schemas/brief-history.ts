import { z } from "zod";
import { BriefSummarySchema } from "./case-detail.ts";

/**
 * Upper bound on briefs returned by `GET /api/cases/:id/briefs`. Re-runs are
 * rare (a handful per case at most), so the full payload of each run is
 * returned for instant client-side version switching without an N+1 — but the
 * list is still capped so a pathological re-run loop cannot return an unbounded
 * response.
 */
export const BRIEF_HISTORY_LIMIT = 20;

/** One historical brief: the case-detail brief summary plus its run id. */
const BriefHistoryEntrySchema = BriefSummarySchema.extend({
  run_id: z.string(),
});

export type BriefHistoryEntry = z.infer<typeof BriefHistoryEntrySchema>;

/** Response for `GET /api/cases/:id/briefs` — newest run first. */
export const BriefHistoryResponseSchema = z.object({
  briefs: z.array(BriefHistoryEntrySchema),
});

export type BriefHistoryResponse = z.infer<typeof BriefHistoryResponseSchema>;

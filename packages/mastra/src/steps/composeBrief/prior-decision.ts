import { and, briefs, desc, eq, ne, reviewer_actions, type Db } from "@mizan/db";
import type { Recommendation, ReviewerAction } from "@mizan/shared";

/**
 * Prior-review context fed into composeBrief on a re-run. It is the SINGLE
 * latest prior brief plus the latest reviewer action — never an accumulated
 * history. Each re-run therefore sees only the immediately preceding decision
 * (run N reads run N-1, not N-2/N-3…), so the prompt stays bounded and
 * "latest decision wins". On a true first run the whole value is `null` and
 * nothing is injected.
 *
 * It captures the open review loop: what the AI recommended, the concrete gap
 * the reviewer flagged (`prior_missing_docs`), and what the reviewer decided
 * and why. The client's actual response (new documents) is NOT duplicated here
 * — it arrives as the fresh extractions composeBrief already operates on.
 */
export interface PriorDecision {
  readonly prior_recommendation: Recommendation | null;
  readonly prior_confidence: number | null;
  readonly prior_missing_docs: readonly string[];
  readonly reviewer_action: ReviewerAction | null;
  readonly reviewer_rationale: string | null;
}

/**
 * Reads the latest prior brief (any run except the in-flight one) and the
 * latest reviewer action for the case. `run_id != currentRunId` excludes the
 * current run's own row so a compose-only retry (queue redelivery) never reads
 * its partial brief back as "prior". Returns `null` when neither exists.
 */
export async function fetchPriorDecision(
  db: Db,
  caseId: string,
  currentRunId: string,
): Promise<PriorDecision | null> {
  const priorBrief = await db
    .select({ payload: briefs.payload_json })
    .from(briefs)
    .where(and(eq(briefs.case_id, caseId), ne(briefs.run_id, currentRunId)))
    .orderBy(desc(briefs.composed_at))
    .limit(1)
    .get();

  const priorAction = await db
    .select({ action: reviewer_actions.action, rationale: reviewer_actions.rationale })
    .from(reviewer_actions)
    .where(eq(reviewer_actions.case_id, caseId))
    .orderBy(desc(reviewer_actions.acted_at))
    .limit(1)
    .get();

  if (!priorBrief && !priorAction) return null;
  const payload = priorBrief?.payload ?? null;
  return {
    prior_recommendation: payload?.recommendation ?? null,
    prior_confidence: payload?.confidence ?? null,
    prior_missing_docs: payload
      ? payload.missing_docs.map((doc) => `${doc.docType}: ${doc.reason}`)
      : [],
    reviewer_action: priorAction?.action ?? null,
    reviewer_rationale: priorAction?.rationale ?? null,
  };
}

/**
 * Post-action pipeline for the reviewer-action route — the inline chain that runs
 * AFTER the case is claimed `SUSPENDED_HITL → RUNNING`. Split from the HTTP route
 * so the orchestration + its two failure tiers are explicit and testable:
 *
 *   - MUST-COMMIT (`runMustCommitSteps`): the reviewer-visible truth — the
 *     `reviewer_actions` row, the resume tape row, the eval promotion, and the
 *     terminal `RUNNING → ACTIONED` transition. A throw here propagates so the
 *     route can revert the claim; nothing is left half-committed.
 *   - BEST-EFFORT (`runBestEffortSteps`): pure side effects that run only AFTER
 *     the action is already ACTIONED — the `workflow.finish` tape row, the BLOCK
 *     auto-archive, and the client notification. A throw here must NOT propagate:
 *     the action is committed, so a revert would be a no-op (the case is no longer
 *     RUNNING) and would surface a misleading 500 for work that succeeded. Each
 *     logs loudly and returns.
 *
 * Why inline (not Mastra `run.resume`): resuming from a different request than the
 * original `stream()` throws "Cannot perform I/O on behalf of a different request"
 * on Cloudflare Workers. The chain is deterministic D1 writes — direct calls keep
 * it a single cross-request-completable surface.
 */
import { emitWorkflowEvent, promoteEvalRow } from "@mizan/mastra/runtime";
import { archiveCase, briefs, and, desc, eq, reviewer_actions, type Db } from "@mizan/db";
import {
  BriefPayloadSchema,
  type BriefPayload,
  type Recommendation,
  type ReviewerAction,
  type ReviewerActionRequest,
  type ReviewerActionResponse,
} from "@mizan/shared";
import { notifyCaseClient } from "../lib/notifications.ts";
import { finalizeActionWithLiveEvents, revertActionClaim } from "./action-live-events.ts";

const EMPTY_RATIONALE = "(none)";

export interface PostActionInput {
  readonly caseId: string;
  readonly runId: string;
  readonly reviewerId: string;
  readonly organizationId: string;
  readonly action: ReviewerAction;
  readonly rationale: string;
  readonly actionId: string;
}

function normalizeStoredRationale(rationale: string): string {
  const trimmed = rationale.trim();
  return trimmed.length > 0 ? trimmed : EMPTY_RATIONALE;
}

async function loadLatestBrief(
  db: Db,
  caseId: string,
  organizationId: string,
  runId: string,
): Promise<{ recommendation: Recommendation; payload: BriefPayload } | null> {
  const row = await db
    .select({ recommendation: briefs.recommendation, payload_json: briefs.payload_json })
    .from(briefs)
    .where(
      and(
        eq(briefs.case_id, caseId),
        eq(briefs.organization_id, organizationId),
        eq(briefs.run_id, runId),
      ),
    )
    .orderBy(desc(briefs.composed_at))
    .limit(1)
    .get();
  if (!row) return null;
  return {
    recommendation: row.recommendation,
    payload: BriefPayloadSchema.parse(row.payload_json),
  };
}

/**
 * MUST-COMMIT steps. Any throw propagates to the caller, which reverts the claim.
 * The `reviewer_actions` insert + eval promotion are idempotent so a retried
 * `action_id` never double-writes.
 */
async function runMustCommitSteps(
  db: Db,
  input: PostActionInput,
  recommendation: Recommendation,
): Promise<void> {
  await db
    .insert(reviewer_actions)
    .values({
      case_id: input.caseId,
      run_id: input.runId,
      reviewer_id: input.reviewerId,
      action: input.action,
      rationale: normalizeStoredRationale(input.rationale),
      action_id: input.actionId,
      organization_id: input.organizationId,
    })
    .onConflictDoNothing({ target: reviewer_actions.action_id });
  await emitWorkflowEvent(db, {
    caseId: input.caseId,
    runId: input.runId,
    organizationId: input.organizationId,
    eventType: "step.resume",
    stepId: "recordAction",
  });
  await promoteEvalRow(db, {
    caseId: input.caseId,
    runId: input.runId,
    actionId: input.actionId,
    recommendation,
    reviewerAction: input.action,
  });
  await finalizeActionWithLiveEvents(db, {
    caseId: input.caseId,
    runId: input.runId,
    reviewerId: input.reviewerId,
    organizationId: input.organizationId,
    action: input.action,
    actionId: input.actionId,
  });
}

/** BEST-EFFORT side effects — run only after ACTIONED; each swallows + logs. */
async function runBestEffortSteps(db: Db, input: PostActionInput): Promise<void> {
  await emitTerminalEventBestEffort(db, input);
  await archiveIfBlockedBestEffort(db, input);
  await notifyClientBestEffort(db, input);
}

async function emitTerminalEventBestEffort(db: Db, input: PostActionInput): Promise<void> {
  try {
    await emitWorkflowEvent(db, {
      caseId: input.caseId,
      runId: input.runId,
      organizationId: input.organizationId,
      eventType: "workflow.finish",
    });
  } catch (error) {
    logBestEffort("workflow.finish tape append", input, error);
  }
}

/**
 * BLOCK drops the case off the active queue + fans `case.archived`, via the SAME
 * `archiveCase` helper the manual route uses so the two paths can't diverge.
 */
async function archiveIfBlockedBestEffort(db: Db, input: PostActionInput): Promise<void> {
  if (input.action !== "BLOCK") return;
  try {
    await archiveCase(db, {
      caseId: input.caseId,
      organizationId: input.organizationId,
      archived: true,
      actorUserId: input.reviewerId,
    });
  } catch (error) {
    logBestEffort("BLOCK auto-archive", input, error);
  }
}

async function notifyClientBestEffort(db: Db, input: PostActionInput): Promise<void> {
  try {
    await notifyCaseClient(db, input.caseId, input.reviewerId, decisionNotice(input.action));
  } catch (error) {
    logBestEffort("client decision notice", input, error);
  }
}

function logBestEffort(label: string, input: PostActionInput, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(
    `[action] ${label} failed post-commit (case=${input.caseId} run=${input.runId}): ${reason}`,
  );
}

/** Friendly client-facing notice for a terminal reviewer action. */
function decisionNotice(action: ReviewerAction): { type: "status"; title: string; body: string } {
  const body =
    action === "APPROVE"
      ? "Your campaign was approved."
      : action === "BLOCK"
        ? "Your campaign was not approved."
        : action === "ESCALATE"
          ? "Your campaign is under further review."
          : "Your reviewer asked for more documents.";
  return { type: "status", title: "Review update", body };
}

/**
 * Runs the full post-claim chain and returns the brief payload for the response.
 * Throws ONLY from the precondition (missing brief) or a must-commit step — the
 * caller catches and reverts. Best-effort steps never throw.
 */
export async function runPostActionChain(db: Db, input: PostActionInput): Promise<BriefPayload> {
  const brief = await loadLatestBrief(db, input.caseId, input.organizationId, input.runId);
  if (!brief) {
    throw new Error(`action: brief row missing for case ${input.caseId} run ${input.runId}`);
  }
  await runMustCommitSteps(db, input, brief.recommendation);
  await runBestEffortSteps(db, input);
  return brief.payload;
}

/**
 * Reverts a failed post-action claim back to SUSPENDED_HITL. Must never throw:
 * the caller is already handling a chain failure, and a propagating revert error
 * would crash the request AND leave the case stuck RUNNING. A double D1 fault
 * (chain AND revert) needs manual recovery — two independent failures in one
 * request, an accepted residual over building a sweep for a path that has none.
 */
export async function revertClaim(
  db: Db,
  caseId: string,
  runId: string,
  organizationId: string,
  cause: unknown,
): Promise<void> {
  const reason = cause instanceof Error ? cause.message : String(cause);
  try {
    const reverted = await revertActionClaim(db, caseId, runId, organizationId);
    if (!reverted) {
      console.error(
        `[action] revertClaim no-op — case ${caseId} run ${runId} already off RUNNING (cause=${reason})`,
      );
      return;
    }
    console.error(
      `[action] post-action chain failed — reverted claim (case=${caseId} run=${runId}): ${reason}`,
    );
  } catch (revertError) {
    const revertReason = revertError instanceof Error ? revertError.message : String(revertError);
    console.error(
      `[action] revertClaim FAILED — case ${caseId} run ${runId} may be stuck RUNNING (chain cause=${reason}, revert error=${revertReason})`,
    );
  }
}

/**
 * Builds the success envelope from already-validated inputs. `brief` was
 * runtime-parsed at `loadLatestBrief` (BEFORE the commit chain wrote any row) and
 * `body` was validated by the route's `zValidator`, so this never re-parses —
 * re-strict-parsing committed data is exactly what produced a 500 AFTER a partial
 * commit when the brief schema later tightened. The cache layer still `safeParse`s
 * the envelope on read, keeping the wire contract enforced.
 */
export function buildResponse(
  brief: BriefPayload | null,
  body: ReviewerActionRequest,
): ReviewerActionResponse {
  return { status: "success", brief, action: body };
}

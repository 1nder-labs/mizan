import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { awaitReviewerAction } from "../steps/awaitReviewerAction.ts";
import { ReviewerActionStepStateSchema } from "../schemas/reviewer-action-suspend.ts";
import { classifyCampaign } from "../steps/classifyCampaign.ts";
import { classifyVouchingChain } from "../steps/classifyVouchingChain/index.ts";
import { composeBrief } from "../steps/composeBrief/index.ts";
import { computeVerificationPath } from "../steps/computeVerificationPath.ts";
import { draftOrganizerMessage } from "../steps/draftOrganizerMessage/index.ts";
import { extractBankStatement } from "../steps/extractBankStatement.ts";
import { extractCategoryDocs } from "../steps/extractCategoryDocs.ts";
import { extractCreatorIdDoc } from "../steps/extractCreatorIdDoc.ts";
import { extractStoryClaims } from "../steps/extractStoryClaims.ts";
import { forcedEscalateGate } from "../steps/forcedEscalateGate/index.ts";
import { matchPolicy } from "../steps/matchPolicy/index.ts";
import { mergeSignals } from "../steps/mergeSignals.ts";
import { ocrMismatch } from "../steps/ocrMismatch/index.ts";
import { photoSignal } from "../steps/photoSignal/index.ts";
import { storyCoherence } from "../steps/storyCoherence/index.ts";

/**
 * Brief workflow — Phase 4 inserts trust-signal steps between extractors and
 * matchPolicy, plus forcedEscalateGate + draftOrganizerMessage after
 * composeBrief.
 *
 * The three signal-extraction steps (photoSignal, storyCoherence,
 * classifyVouchingChain) run in `.parallel(...)` because they share no
 * data dependency on each other — only on the upstream extractions.
 * `mergeSignals` re-joins the parallel outputs into a single
 * `PartialBriefStateSchema` so every downstream step keeps the standard
 * step-input shape.
 *
 * Post-compose ordering: `forcedEscalateGate → draftOrganizerMessage →
 * awaitReviewerAction`. The gate fires first so an OFAC + community-
 * vouching REQUEST_DOCS case is overridden to ESCALATE before the
 * draft LLM runs — `draftOrganizerMessage` then sees ESCALATE and
 * short-circuits, saving a call.
 *
 * `awaitReviewerAction` is the TERMINAL step. It calls `step.suspend()`
 * which closes the workflow stream cleanly with `status: "suspended"`.
 * The post-action chain (record reviewer_actions, append to
 * eval_promotions, flip case to ACTIONED, emit workflow.finish) is
 * owned by `POST /api/cases/:id/action` directly, NOT a Mastra resume.
 *
 * The workflow `outputSchema` therefore mirrors the terminal step's
 * `ReviewerActionStepStateSchema`, not `composeBrief`'s `BriefPayload`:
 * the brief is an intermediate product, and the only value the workflow
 * could ever resolve to (on a resume path) is the reviewer-action state.
 *
 * Why no Mastra resume: `Workflow.resume()` from a different request
 * than the original `Workflow.stream()` hits Cloudflare Workers' I/O
 * isolation boundary ("Cannot perform I/O on behalf of a different
 * request"). The post-action work is three deterministic D1 writes —
 * better expressed as direct route logic than as a workflow chain
 * that the runtime cannot complete cross-request. See
 * `apps/worker/src/routes/actions.ts` for the inline implementation.
 */
export const briefWorkflow = createWorkflow({
  id: "brief",
  inputSchema: z.object({ caseId: z.string(), runId: z.string() }),
  outputSchema: ReviewerActionStepStateSchema,
})
  .then(classifyCampaign)
  .then(extractCreatorIdDoc)
  .then(extractBankStatement)
  .then(extractCategoryDocs)
  .then(extractStoryClaims)
  .parallel([photoSignal, storyCoherence, classifyVouchingChain, ocrMismatch])
  .then(mergeSignals)
  .then(computeVerificationPath)
  .then(matchPolicy)
  .then(composeBrief)
  .then(forcedEscalateGate)
  .then(draftOrganizerMessage)
  .then(awaitReviewerAction)
  .commit();

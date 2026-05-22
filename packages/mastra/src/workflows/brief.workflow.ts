import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { BriefPayloadSchema } from "../schemas/brief.ts";
import { awaitReviewerAction } from "../steps/awaitReviewerAction.ts";
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
import { photoSignal } from "../steps/photoSignal/index.ts";
import { storyCoherence } from "../steps/storyCoherence.ts";

/**
 * Brief workflow — Phase 4 inserts trust-signal steps between extractors and
 * matchPolicy, plus draftOrganizerMessage + forcedEscalateGate after composeBrief.
 *
 * The three signal-extraction steps (photoSignal, storyCoherence,
 * classifyVouchingChain) run in `.parallel(...)` because they share no
 * data dependency on each other — only on the upstream extractions.
 * `mergeSignals` re-joins the parallel outputs into a single
 * `PartialBriefStateSchema` so every downstream step keeps the standard
 * step-input shape.
 */
export const briefWorkflow = createWorkflow({
  id: "brief",
  inputSchema: z.object({ caseId: z.string(), runId: z.string() }),
  outputSchema: BriefPayloadSchema,
})
  .then(classifyCampaign)
  .then(extractCreatorIdDoc)
  .then(extractBankStatement)
  .then(extractCategoryDocs)
  .then(extractStoryClaims)
  .parallel([photoSignal, storyCoherence, classifyVouchingChain])
  .then(mergeSignals)
  .then(computeVerificationPath)
  .then(matchPolicy)
  .then(composeBrief)
  .then(draftOrganizerMessage)
  .then(forcedEscalateGate)
  .then(awaitReviewerAction)
  .commit();

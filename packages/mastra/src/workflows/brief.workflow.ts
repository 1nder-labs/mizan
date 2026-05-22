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
import { photoSignal } from "../steps/photoSignal/index.ts";
import { storyCoherence } from "../steps/storyCoherence.ts";

/**
 * Brief workflow — Phase 4 inserts trust-signal steps between extractors and
 * matchPolicy, plus draftOrganizerMessage + forcedEscalateGate after composeBrief.
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
  .then(photoSignal)
  .then(storyCoherence)
  .then(classifyVouchingChain)
  .then(computeVerificationPath)
  .then(matchPolicy)
  .then(composeBrief)
  .then(draftOrganizerMessage)
  .then(forcedEscalateGate)
  .then(awaitReviewerAction)
  .commit();

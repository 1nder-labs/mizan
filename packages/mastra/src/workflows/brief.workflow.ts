import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { BriefPayloadSchema } from "../schemas/brief.ts";
import { awaitReviewerAction } from "../steps/awaitReviewerAction.ts";
import { classifyCampaign } from "../steps/classifyCampaign.ts";
import { composeBrief } from "../steps/composeBrief.ts";
import { extractBankStatement } from "../steps/extractBankStatement.ts";
import { extractCategoryDocs } from "../steps/extractCategoryDocs.ts";
import { extractCreatorIdDoc } from "../steps/extractCreatorIdDoc.ts";
import { extractStoryClaims } from "../steps/extractStoryClaims.ts";

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
  .then(composeBrief)
  .then(awaitReviewerAction)
  .commit();

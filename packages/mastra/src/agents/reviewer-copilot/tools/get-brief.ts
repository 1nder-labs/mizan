import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CopilotHandlerDeps } from "./deps.ts";

/** Read-only brief loader tool for the reviewer copilot. */
export function createGetBriefTool(deps: CopilotHandlerDeps) {
  return createTool({
    id: "get_brief",
    description:
      "Load the current brief for one case by its case id. Returns the brief payload (recommendation, confidence, missing_docs, drafted_message, policy_citations). Throws not_found if no brief exists yet for that case.",
    inputSchema: z.object({ caseId: z.string().uuid() }),
    outputSchema: z.object({ brief: z.record(z.string(), z.unknown()) }),
    execute: async (inputData, context) => {
      const { viewer, db } = deps.parseRuntime(context?.requestContext);
      const brief = await deps.loadBrief(inputData.caseId, viewer, db);
      return {
        brief: {
          recommendation: brief.recommendation,
          confidence: brief.confidence,
          composed_at: brief.composed_at.getTime(),
          payload_json: brief.payload_json,
        },
      };
    },
  });
}

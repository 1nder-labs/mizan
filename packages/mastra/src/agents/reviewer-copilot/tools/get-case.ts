import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CopilotHandlerDeps } from "./deps.ts";

/** Read-only case detail tool for the reviewer copilot. */
export function createGetCaseTool(deps: CopilotHandlerDeps) {
  return createTool({
    id: "get_case",
    description:
      "Load one case by its id. Returns the case row plus its current brief and most recent signals. Throws not_found if the case does not exist or is in another organization. Use for specific-case queries.",
    inputSchema: z.object({ caseId: z.string().uuid() }),
    outputSchema: z.object({ case: z.record(z.string(), z.unknown()) }),
    execute: async (inputData, context) => {
      const { viewer, db } = deps.parseRuntime(context?.requestContext);
      const detail = await deps.fetchCaseDetail(inputData.caseId, viewer, db);
      if (!detail) {
        throw new deps.NotFoundError(`case not found: ${inputData.caseId}`);
      }
      return { case: detail };
    },
  });
}

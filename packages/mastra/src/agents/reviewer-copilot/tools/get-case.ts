import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CopilotHandlerDeps } from "./deps.ts";

const getCaseInput = z
  .object({
    caseId: z.string().uuid().optional(),
    title: z.string().min(1).max(120).optional(),
  })
  .refine((value) => value.caseId !== undefined || value.title !== undefined, {
    message: "provide either caseId or title",
  });

/** Read-only case detail tool for the reviewer copilot. */
export function createGetCaseTool(deps: CopilotHandlerDeps) {
  return createTool({
    id: "get_case",
    description:
      "Load one case by its id OR its exact title (case-insensitive) — pass `caseId` for a known id, or `title` for the campaign name. Returns the case row plus its current brief and most recent signals. Throws not_found if no case matches the id/title or it is in another organization, and throws if a title matches more than one case (open it by id instead). Use for specific-case queries; to find a case from a partial or fuzzy name, use list_cases with its `title` filter first.",
    inputSchema: getCaseInput,
    outputSchema: z.object({ case: z.record(z.string(), z.unknown()) }),
    execute: async (inputData, context) => {
      const { viewer, db } = deps.parseRuntime(context?.requestContext);
      let caseId = inputData.caseId;
      if (!caseId) {
        const title = inputData.title;
        if (!title) throw new deps.NotFoundError("provide a case id or title");
        const resolved = await deps.resolveCaseIdByTitle(title, viewer, db);
        if (resolved.status === "none") {
          throw new deps.NotFoundError(`no case titled "${title}" in this organization`);
        }
        if (resolved.status === "ambiguous") {
          throw new deps.NotFoundError(
            `more than one case is titled "${title}" (${resolved.count}); open it by id instead`,
          );
        }
        caseId = resolved.caseId;
      }
      const detail = await deps.fetchCaseDetail(caseId, viewer, db);
      if (!detail) throw new deps.NotFoundError(`case not found: ${caseId}`);
      return { case: detail };
    },
  });
}

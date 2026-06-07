import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CopilotHandlerDeps } from "./deps.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `caseId` is a loose string (not `.uuid()`) and neither field is required, so a
 * malformed or absent id still reaches `execute` instead of being rejected at
 * validation — `execute` then falls back to the open page case. A strict schema
 * here means one corrupted tool-call argument fails the whole call.
 */
const getCaseInput = z.object({
  caseId: z.string().optional(),
  title: z.string().min(1).max(120).optional(),
});

/** Read-only case detail tool for the reviewer copilot. */
export function createGetCaseTool(deps: CopilotHandlerDeps) {
  return createTool({
    id: "get_case",
    description:
      "Load one case by its id OR its exact title (case-insensitive) — pass `caseId` for a known id, or `title` for the campaign name. If the reviewer is asking about the case they currently have open and you pass neither, it resolves to that open case. Returns the case row plus its current brief and most recent signals. Throws not_found if no case matches, and throws if a title matches more than one case (open it by id instead). To find a case from a partial or fuzzy name, use list_cases with its `title` filter first.",
    inputSchema: getCaseInput,
    outputSchema: z.object({ case: z.record(z.string(), z.unknown()) }),
    execute: async (inputData, context) => {
      const { viewer, db, pageCaseId } = deps.parseRuntime(context?.requestContext);
      let caseId =
        inputData.caseId && UUID_RE.test(inputData.caseId) ? inputData.caseId : undefined;
      if (!caseId && inputData.title) {
        const resolved = await deps.resolveCaseIdByTitle(inputData.title, viewer, db);
        if (resolved.status === "none") {
          throw new deps.NotFoundError(`no case titled "${inputData.title}" in this organization`);
        }
        if (resolved.status === "ambiguous") {
          throw new deps.NotFoundError(
            `more than one case is titled "${inputData.title}" (${resolved.count}); open it by id instead`,
          );
        }
        caseId = resolved.caseId;
      }
      caseId ??= pageCaseId;
      if (!caseId)
        throw new deps.NotFoundError("no case id or title provided, and no case is open");
      const detail = await deps.fetchCaseDetail(caseId, viewer, db);
      if (!detail) throw new deps.NotFoundError(`case not found: ${caseId}`);
      return { case: detail };
    },
  });
}

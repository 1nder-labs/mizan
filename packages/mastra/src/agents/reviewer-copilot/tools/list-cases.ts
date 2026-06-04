import { createTool } from "@mastra/core/tools";
import { CaseStatusEnum, QUEUE_PAGE_SIZE, QueueSearchSchema } from "@mizan/shared";
import { z } from "zod";
import type { CopilotHandlerDeps } from "./deps.ts";

const listCasesOutput = z.object({
  cases: z.array(z.record(z.string(), z.unknown())),
  truncated: z.boolean(),
});

/** Read-only queue listing tool for the reviewer copilot. */
export function createListCasesTool(deps: CopilotHandlerDeps) {
  return createTool({
    id: "list_cases",
    description: `List cases visible to the current viewer in their active organization. Accepts optional filters: title (a fuzzy, case-insensitive substring of the campaign title — use this to find a case by name, e.g. title:"hira"), status (one of DRAFT/QUEUED/RUNNING/SUSPENDED_HITL/READY_FOR_REVIEW/ACTIONED/FAILED), assignee (a user id, or the string 'me' for the current viewer, or 'unassigned'), category, geography. Returns up to ${QUEUE_PAGE_SIZE} cases; the response includes a 'truncated' boolean indicating whether more cases match the filter. Use for overview queries and for resolving a campaign name to a case before calling get_case.`,
    inputSchema: z.object({
      title: z.string().optional(),
      status: CaseStatusEnum.optional(),
      assignee: z.string().optional(),
      category: z.string().optional(),
      geography: z.string().optional(),
    }),
    outputSchema: listCasesOutput,
    execute: async (inputData, context) => {
      const { viewer, db } = deps.parseRuntime(context?.requestContext);
      const search = QueueSearchSchema.parse({
        page: 1,
        sort: "updated_desc",
        view: "list",
        title: inputData.title,
        status: inputData.status,
        category: inputData.category,
        geography: inputData.geography,
        assignee: inputData.assignee,
      });
      const result = await deps.listCasesForViewer(search, viewer, db);
      return listCasesOutput.parse({
        cases: result.cases,
        truncated: result.total > result.cases.length,
      });
    },
  });
}

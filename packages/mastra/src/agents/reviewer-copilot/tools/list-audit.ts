import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CopilotHandlerDeps } from "./deps.ts";

const AUDIT_PAGE_SIZE = 50;

/** Read-only audit listing tool for the reviewer copilot. */
export function createListAuditTool(deps: CopilotHandlerDeps) {
  return createTool({
    id: "list_audit",
    description: `List recent reviewer actions in the current viewer's active organization. ADMIN-ONLY: throws forbidden if the viewer is not an admin. Returns up to ${AUDIT_PAGE_SIZE} audit rows ordered newest-first.`,
    inputSchema: z.object({ page: z.number().int().positive().default(1) }),
    outputSchema: z.object({
      entries: z.array(z.record(z.string(), z.unknown())),
      total: z.number(),
    }),
    execute: async (inputData, context) => {
      const { viewer, db } = deps.parseRuntime(context?.requestContext);
      const page = await deps.listAuditPage(
        { page: inputData.page ?? 1, page_size: AUDIT_PAGE_SIZE },
        viewer,
        db,
      );
      return {
        entries: page.entries.map((entry) => ({
          id: entry.id,
          case_id: entry.case_id,
          action: entry.action,
          reviewer_email: entry.reviewer_email,
          acted_at: entry.acted_at.getTime(),
        })),
        total: page.total,
      };
    },
  });
}

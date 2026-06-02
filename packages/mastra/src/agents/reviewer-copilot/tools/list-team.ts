import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CopilotHandlerDeps } from "./deps.ts";

/** Read-only team listing tool for the reviewer copilot. */
export function createListTeamTool(deps: CopilotHandlerDeps) {
  return createTool({
    id: "list_team",
    description:
      "List members of the current viewer's active organization. Returns user_id, email, role for each member. Use for assignment-related queries.",
    inputSchema: z.object({}),
    outputSchema: z.object({ members: z.array(z.record(z.string(), z.unknown())) }),
    execute: async (_inputData, context) => {
      const { viewer, db } = deps.parseRuntime(context?.requestContext);
      const members = await deps.listTeamMembers(viewer, db);
      return {
        members: members.map((member) => ({
          id: member.id,
          email: member.email,
          name: member.name,
          role: member.role,
          createdAt: member.createdAt,
        })),
      };
    },
  });
}

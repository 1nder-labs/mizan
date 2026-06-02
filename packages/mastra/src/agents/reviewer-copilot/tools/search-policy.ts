import { createTool } from "@mastra/core/tools";
import { PolicyClauseSourceEnum } from "@mizan/shared";
import { z } from "zod";
import type { CopilotHandlerDeps } from "./deps.ts";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

/** Read-only free-text policy search tool for the reviewer copilot. */
export function createSearchPolicyTool(deps: CopilotHandlerDeps) {
  return createTool({
    id: "search_policy",
    description:
      "Free-text search across the bundled LaunchGood policy corpora (zakat eligibility + trust & safety). Use when the reviewer asks what the policy says about a topic and no clause id is known. Returns the top matching clauses with id, title, and a snippet ranked by relevance; follow up with get_policy_clause for the full clause body.",
    inputSchema: z.object({
      query: z.string().min(2),
      limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          clauseId: z.string(),
          source: PolicyClauseSourceEnum,
          title: z.string(),
          snippet: z.string(),
          score: z.number(),
        }),
      ),
    }),
    execute: async (inputData) => {
      return {
        results: await deps.searchPolicy(inputData.query, inputData.limit ?? DEFAULT_LIMIT),
      };
    },
  });
}

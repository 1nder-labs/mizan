import { createTool } from "@mastra/core/tools";
import { PolicyClauseSourceEnum } from "@mizan/shared";
import { z } from "zod";
import type { CopilotHandlerDeps } from "./deps.ts";

/** Read-only policy clause lookup tool for the reviewer copilot. */
export function createGetPolicyClauseTool(deps: CopilotHandlerDeps) {
  return createTool({
    id: "get_policy_clause",
    description:
      "Look up one policy clause by its clause id (e.g. 'zakat.local_first'). Returns the clause's title, body, and citation. Throws not_found if the id is unknown. Use when a clause id is already known; do not use for free-text policy search.",
    inputSchema: z.object({
      clauseId: z.string().min(1),
      source: PolicyClauseSourceEnum.default("zakat"),
    }),
    outputSchema: z.object({
      clauseId: z.string(),
      source: PolicyClauseSourceEnum,
      title: z.string(),
      body: z.string(),
      corpusVersion: z.string(),
    }),
    execute: async (inputData) => {
      return deps.getPolicyClause(inputData.clauseId, inputData.source ?? "zakat");
    },
  });
}

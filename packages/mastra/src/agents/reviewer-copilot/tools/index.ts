import type { CopilotHandlerDeps } from "./deps.ts";
import { createGetBriefTool } from "./get-brief.ts";
import { createGetCaseTool } from "./get-case.ts";
import { createGetPolicyClauseTool } from "./get-policy-clause.ts";
import { createListAuditTool } from "./list-audit.ts";
import { createListCasesTool } from "./list-cases.ts";
import { createListSignalsTool } from "./list-signals.ts";
import { createListTeamTool } from "./list-team.ts";

export type { CopilotHandlerDeps, CopilotRuntimeBag } from "./deps.ts";

/** Builds the seven read-only reviewer copilot tools from injected handlers. */
export function buildReviewerCopilotTools(deps: CopilotHandlerDeps) {
  return {
    list_cases: createListCasesTool(deps),
    get_case: createGetCaseTool(deps),
    get_policy_clause: createGetPolicyClauseTool(deps),
    list_signals: createListSignalsTool(deps),
    list_team: createListTeamTool(deps),
    list_audit: createListAuditTool(deps),
    get_brief: createGetBriefTool(deps),
  };
}

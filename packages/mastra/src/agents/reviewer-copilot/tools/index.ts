import type { ToolsInput } from "@mastra/core/agent";
import type { CopilotHandlerDeps } from "./deps.ts";
import { createGetBriefTool } from "./get-brief.ts";
import { createGetCaseTool } from "./get-case.ts";
import { createGetPolicyClauseTool } from "./get-policy-clause.ts";
import { createListAuditTool } from "./list-audit.ts";
import { createListCasesTool } from "./list-cases.ts";
import { createListSignalsTool } from "./list-signals.ts";
import { createListTeamTool } from "./list-team.ts";
import { createSearchPolicyTool } from "./search-policy.ts";

export type { CopilotHandlerDeps, CopilotRuntimeBag } from "./deps.ts";

/** Copilot caller roles. Mirrors `ViewerContext.role`. */
export type CopilotRole = "admin" | "reviewer" | "client";

/**
 * Tool ids a non-admin reviewer is never handed. This is the model-layer
 * half of a two-layer guard: gating the tool map here means the model
 * cannot even emit a call for an admin-only tool, while the handler layer
 * (e.g. `listAuditPage` throwing `ForbiddenError` for non-admins) remains
 * the authoritative backstop if the map is ever mis-wired.
 */
const ADMIN_ONLY_TOOL_IDS: ReadonlySet<string> = new Set(["list_audit"]);

/**
 * Builds the read-only reviewer copilot tools, scoped to `role`. Admins get
 * the full set; reviewers get every tool except the admin-only ones.
 */
export function buildReviewerCopilotTools(deps: CopilotHandlerDeps, role: CopilotRole): ToolsInput {
  const all = {
    list_cases: createListCasesTool(deps),
    get_case: createGetCaseTool(deps),
    get_policy_clause: createGetPolicyClauseTool(deps),
    search_policy: createSearchPolicyTool(deps),
    list_signals: createListSignalsTool(deps),
    list_team: createListTeamTool(deps),
    list_audit: createListAuditTool(deps),
    get_brief: createGetBriefTool(deps),
  };
  if (role === "admin") return all;
  return Object.fromEntries(Object.entries(all).filter(([id]) => !ADMIN_ONLY_TOOL_IDS.has(id)));
}

import type { ToolsInput } from "@mastra/core/agent";
import type { CopilotHandlerDeps } from "./deps.ts";
import { createGetBriefTool } from "./get-brief.ts";
import { createGetCaseTool } from "./get-case.ts";
import { createGetPolicyClauseTool } from "./get-policy-clause.ts";
import { createListAuditTool } from "./list-audit.ts";
import { createListCasesTool } from "./list-cases.ts";
import { createListSignalsTool } from "./list-signals.ts";
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
 * Tools withheld when a specific case is already in context. `list_cases` is
 * the queue browse/navigation tool — with a case open the reviewer is focused
 * on it, so dropping the tool shrinks the per-call prompt (and thus latency)
 * without losing reach: case detail, brief, signals, and policy tools stay,
 * and a named other-case is still resolvable via `get_case`.
 */
const CASE_CONTEXT_WITHHELD_TOOL_IDS: ReadonlySet<string> = new Set(["list_cases"]);

/** Options narrowing the copilot tool set to the request's context. */
interface CopilotToolContext {
  readonly caseOpen?: boolean;
}

/**
 * Builds the read-only reviewer copilot tools, scoped to `role` and the request
 * context. Non-admins never receive admin-only tools; when a case is open the
 * queue-navigation tool is withheld to keep the prompt (and latency) tight.
 */
export function buildReviewerCopilotTools(
  deps: CopilotHandlerDeps,
  role: CopilotRole,
  context: CopilotToolContext = {},
): ToolsInput {
  const all = {
    list_cases: createListCasesTool(deps),
    get_case: createGetCaseTool(deps),
    get_policy_clause: createGetPolicyClauseTool(deps),
    search_policy: createSearchPolicyTool(deps),
    list_signals: createListSignalsTool(deps),
    list_audit: createListAuditTool(deps),
    get_brief: createGetBriefTool(deps),
  };
  return Object.fromEntries(
    Object.entries(all).filter(([id]) => {
      if (role !== "admin" && ADMIN_ONLY_TOOL_IDS.has(id)) return false;
      if (context.caseOpen && CASE_CONTEXT_WITHHELD_TOOL_IDS.has(id)) return false;
      return true;
    }),
  );
}

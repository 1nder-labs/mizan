import { buildReviewerCopilotTools, searchPolicyVectorize, type CopilotRole } from "@mizan/mastra";
import type { CloudflareBindings } from "../env.ts";
import {
  fetchCaseDetail,
  listCasesForViewer,
  loadBrief,
  NotFoundError,
} from "../handlers/cases-handler.ts";
import {
  getPolicyClause,
  listAuditPage,
  listSignalsForCase,
  listTeamMembers,
} from "../handlers/read-handlers.ts";
import { parseCopilotRuntime } from "./copilot-runtime.ts";

/**
 * Builds the read-only copilot tools bound to the request env + caller role.
 * `searchPolicy` closes over `env` so it can embed the query and hit the
 * Vectorize index (same retrieval path as the brief's `matchPolicy` step).
 * Admin-only tools are withheld from reviewers by `buildReviewerCopilotTools`.
 */
export function buildCopilotTools(env: CloudflareBindings, role: CopilotRole) {
  return buildReviewerCopilotTools(
    {
      parseRuntime: parseCopilotRuntime,
      listCasesForViewer,
      fetchCaseDetail,
      loadBrief,
      listSignalsForCase,
      getPolicyClause,
      searchPolicy: (query, limit) => searchPolicyVectorize(env, query, limit),
      listTeamMembers,
      listAuditPage,
      NotFoundError,
    },
    role,
  );
}

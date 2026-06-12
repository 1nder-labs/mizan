import { buildReviewerCopilotTools, searchPolicyVectorize, type CopilotRole } from "@mizan/mastra";
import type { CloudflareBindings } from "../env.ts";
import {
  fetchCaseDetail,
  listCasesForViewer,
  loadBrief,
  NotFoundError,
  resolveCaseIdByTitle,
} from "../handlers/cases-handler.ts";
import { getPolicyClause, listAuditPage, listSignalsForCase } from "../handlers/read-handlers.ts";
import { parseCopilotRuntime } from "./copilot-runtime.ts";

/**
 * Builds the read-only copilot tools bound to the request env, caller role, and
 * request context. `searchPolicy` closes over `env` so it can embed the query
 * and hit the Vectorize index (same retrieval path as the brief's `matchPolicy`
 * step). Admin-only tools are withheld from reviewers, and the queue-navigation
 * tool is withheld when a case is open — both by `buildReviewerCopilotTools`.
 */
export function buildCopilotTools(
  env: CloudflareBindings,
  role: CopilotRole,
  context: { caseOpen?: boolean } = {},
) {
  return buildReviewerCopilotTools(
    {
      parseRuntime: parseCopilotRuntime,
      listCasesForViewer,
      fetchCaseDetail,
      resolveCaseIdByTitle,
      loadBrief,
      listSignalsForCase,
      getPolicyClause,
      searchPolicy: (query, limit) => searchPolicyVectorize(env, query, limit),
      listAuditPage,
      NotFoundError,
    },
    role,
    context,
  );
}

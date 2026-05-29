import { buildReviewerCopilotTools } from "@mizan/mastra";
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

/** Builds the seven read-only copilot tools bound to the request db handle. */
export function buildCopilotTools() {
  return buildReviewerCopilotTools({
    parseRuntime: parseCopilotRuntime,
    listCasesForViewer,
    fetchCaseDetail,
    loadBrief,
    listSignalsForCase,
    getPolicyClause,
    listTeamMembers,
    listAuditPage,
    NotFoundError,
  });
}

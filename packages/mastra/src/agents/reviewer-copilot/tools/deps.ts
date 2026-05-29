import type { RequestContext } from "@mastra/core/request-context";
import type { AuditRow, Db } from "@mizan/db";
import type {
  AuditListSearch,
  BriefPayload,
  CaseDetailResponse,
  PolicyClauseSource,
  QueueResponse,
  QueueSearch,
  SignalPayload,
  ViewerContext,
} from "@mizan/shared";

/** Viewer + db handles injected into copilot tool request context. */
export interface CopilotRuntimeBag {
  readonly viewer: ViewerContext;
  readonly db: Db;
}

/** Brief row returned by the copilot get_brief handler. */
export interface CopilotBriefRow {
  readonly recommendation: string;
  readonly confidence: number;
  readonly composed_at: Date;
  readonly payload_json: BriefPayload;
}

/** Policy clause payload returned by the copilot get_policy_clause handler. */
export interface CopilotPolicyClause {
  readonly clauseId: string;
  readonly source: PolicyClauseSource;
  readonly title: string;
  readonly body: string;
  readonly corpusVersion: string;
}

/** Signal row returned by the copilot list_signals handler. */
export interface CopilotSignalRow {
  readonly signal_type: string;
  readonly payload_json: SignalPayload;
  readonly recorded_at: number;
  readonly run_id: string;
}

/** Team member row returned by the copilot list_team handler. */
export interface CopilotTeamMember {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: string;
  readonly createdAt: number;
}

/** Injectable read handlers and runtime parser for reviewer copilot tools. */
export interface CopilotHandlerDeps {
  readonly parseRuntime: (requestContext: RequestContext | undefined) => CopilotRuntimeBag;
  readonly listCasesForViewer: (
    input: QueueSearch,
    viewer: ViewerContext,
    db: Db,
  ) => Promise<QueueResponse>;
  readonly fetchCaseDetail: (
    caseId: string,
    viewer: ViewerContext,
    db: Db,
  ) => Promise<CaseDetailResponse | null>;
  readonly loadBrief: (caseId: string, viewer: ViewerContext, db: Db) => Promise<CopilotBriefRow>;
  readonly listSignalsForCase: (
    caseId: string,
    viewer: ViewerContext,
    db: Db,
  ) => Promise<CopilotSignalRow[]>;
  readonly getPolicyClause: (clauseId: string, source: PolicyClauseSource) => CopilotPolicyClause;
  readonly listTeamMembers: (viewer: ViewerContext, db: Db) => Promise<CopilotTeamMember[]>;
  readonly listAuditPage: (
    query: AuditListSearch,
    viewer: ViewerContext,
    db: Db,
  ) => Promise<{ readonly entries: AuditRow[]; readonly total: number }>;
  readonly NotFoundError: new (message: string) => Error;
}

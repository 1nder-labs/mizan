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
  /**
   * The case the reviewer currently has open, injected by the chat route from
   * the page context. `get_case` falls back to this when the model supplies
   * neither a usable id nor a title — so "what's missing on this case?" resolves
   * even if the model fumbles the tool-call arguments.
   */
  readonly pageCaseId?: string;
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

/** One ranked clause hit returned by the copilot search_policy handler. */
export interface CopilotPolicySearchHit {
  readonly clauseId: string;
  readonly source: PolicyClauseSource;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
}

/** Signal row returned by the copilot list_signals handler. */
export interface CopilotSignalRow {
  readonly signal_type: string;
  readonly payload_json: SignalPayload;
  readonly recorded_at: number;
  readonly run_id: string;
}

/**
 * Result of resolving a case by exact title for the copilot get_case tool.
 * `ambiguous` carries the duplicate-title count so the tool can ask the reviewer
 * to disambiguate.
 */
export type CopilotTitleResolution =
  | { readonly status: "found"; readonly caseId: string }
  | { readonly status: "none" }
  | { readonly status: "ambiguous"; readonly count: number };

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
  readonly resolveCaseIdByTitle: (
    title: string,
    viewer: ViewerContext,
    db: Db,
  ) => Promise<CopilotTitleResolution>;
  readonly loadBrief: (caseId: string, viewer: ViewerContext, db: Db) => Promise<CopilotBriefRow>;
  readonly listSignalsForCase: (
    caseId: string,
    viewer: ViewerContext,
    db: Db,
  ) => Promise<CopilotSignalRow[]>;
  readonly getPolicyClause: (clauseId: string, source: PolicyClauseSource) => CopilotPolicyClause;
  readonly searchPolicy: (query: string, limit: number) => Promise<CopilotPolicySearchHit[]>;
  readonly listAuditPage: (
    query: AuditListSearch,
    viewer: ViewerContext,
    db: Db,
  ) => Promise<{ readonly entries: AuditRow[]; readonly total: number }>;
  readonly NotFoundError: new (message: string) => Error;
}

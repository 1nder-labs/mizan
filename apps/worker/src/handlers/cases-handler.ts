/**
 * Shared case read helpers for HTTP routes and Mastra chat tools.
 */
import { and, asc, count, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  briefs as briefsTable,
  caseListProjection,
  cases as casesTable,
  members,
  type Db,
} from "@mizan/db";
import {
  BRIEF_HISTORY_LIMIT,
  CaseDetailResponseSchema,
  CaseOverlaySchema,
  LatestBriefProjectionSchema,
  QUEUE_PAGE_SIZE,
  type BriefHistoryResponse,
  type BriefSummary,
  type CaseDetailResponse,
  type CaseOverlay,
  type CaseRow,
  type LatestBriefProjection,
  type QueueResponse,
  type QueueSearch,
  type ReviewerAction,
  type ViewerContext,
} from "@mizan/shared";
import { clientRespondedFor, latestReviewerAction } from "../lib/case-notes.ts";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

interface PublicCaseColumns {
  readonly id: string;
  readonly status: CaseRow["status"];
  readonly title: string;
  readonly category: string;
  readonly geography: string;
  readonly claimed_zakat_category: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly assigned_to: string | null;
}

/** Maps shared public case columns + a resolved brief to the wire `CaseRow`. */
function mapCaseRow(
  row: PublicCaseColumns,
  latestBrief: LatestBriefProjection | null,
  clientSubmitted: boolean,
): CaseRow {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    category: row.category,
    geography: row.geography,
    claimed_zakat_category: row.claimed_zakat_category,
    created_at: row.created_at.getTime(),
    updated_at: row.updated_at.getTime(),
    latest_brief: latestBrief,
    assigned_to: row.assigned_to,
    client_submitted: clientSubmitted,
  };
}

/**
 * SQL expression returning 1 when the case creator is a `client` member of the
 * org, else 0. Used as a queue triage signal without exposing `created_by`.
 */
function clientSubmittedExpr() {
  return sql<number>`(CASE WHEN (SELECT ${members.role} FROM ${members} WHERE ${members.userId} = ${casesTable.created_by} AND ${members.organizationId} = ${casesTable.organization_id}) = 'client' THEN 1 ELSE 0 END)`;
}

/**
 * RBAC scope for the queue list. A reviewer is HARD-scoped to cases assigned to
 * them — the assignee query param is ignored and unassigned cases are excluded
 * (only admins triage unassigned work). Admins keep the flexible filter
 * (default "all"; can narrow to me / unassigned / a specific reviewer).
 */
function resolveAssigneeFilter(search: QueueSearch, viewer: ViewerContext): SQL | undefined {
  if (viewer.role !== "admin") {
    return eq(casesTable.assigned_to, viewer.userId);
  }
  const effective = search.assignee ?? "all";
  if (effective === "all") return undefined;
  if (effective === "unassigned") return isNull(casesTable.assigned_to);
  if (effective === "me") {
    return or(eq(casesTable.assigned_to, viewer.userId), isNull(casesTable.assigned_to));
  }
  return eq(casesTable.assigned_to, effective);
}

/**
 * Per-case RBAC predicate for single-case reads (detail, title resolution) so
 * the Mastra chat tools — which bypass the HTTP `requireCaseAccess` middleware —
 * enforce the same boundary: a reviewer only resolves cases assigned to them;
 * an admin resolves any case in the org. `undefined` for admin so `and(...)`
 * drops it.
 */
function reviewerAssigneeFilter(viewer: ViewerContext): SQL | undefined {
  return viewer.role === "admin" ? undefined : eq(casesTable.assigned_to, viewer.userId);
}

/**
 * Escapes the LIKE metacharacters (`%`, `_`, `\`) in a user-supplied term so a
 * title filter matches the term literally rather than as a wildcard pattern.
 * Paired with `ESCAPE '\'` on the LIKE clause.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Case-insensitive substring match on `cases.title`. SQLite's LIKE is
 * case-insensitive for ASCII, which covers the campaign titles in use.
 */
function titleLikeFilter(term: string): SQL {
  return sql`${casesTable.title} LIKE ${`%${escapeLike(term)}%`} ESCAPE '\\'`;
}

function buildFilters(search: QueueSearch, viewer: ViewerContext): SQL {
  const filters: SQL[] = [eq(casesTable.organization_id, viewer.organizationId)];
  filters.push(sql`NOT (${clientSubmittedExpr()} = 1 AND ${casesTable.submitted_at} IS NULL)`);
  if (search.status) filters.push(eq(casesTable.status, search.status));
  if (search.title) filters.push(titleLikeFilter(search.title));
  if (search.category) filters.push(sql`LOWER(${casesTable.category}) = LOWER(${search.category})`);
  if (search.geography)
    filters.push(sql`LOWER(${casesTable.geography}) = LOWER(${search.geography})`);
  const assignee = resolveAssigneeFilter(search, viewer);
  if (assignee) filters.push(assignee);
  return and(...filters) ?? eq(casesTable.organization_id, viewer.organizationId);
}

function buildOrder(sort: QueueSearch["sort"]): SQL {
  if (sort === "updated_asc") return asc(casesTable.updated_at);
  if (sort === "created_desc") return desc(casesTable.created_at);
  return desc(casesTable.updated_at);
}

function latestBriefSubquery(caseIdCol: SQL) {
  return {
    latestRecommendation: sql<string | null>`(
      SELECT recommendation FROM briefs
      WHERE briefs.case_id = ${caseIdCol}
      ORDER BY briefs.composed_at DESC
      LIMIT 1
    )`,
    latestVerificationPath: sql<string | null>`(
      SELECT json_extract(payload_json, '$.verification_path') FROM briefs
      WHERE briefs.case_id = ${caseIdCol}
      ORDER BY briefs.composed_at DESC
      LIMIT 1
    )`,
  };
}

function resolveLatestBrief(
  recommendation: string | null,
  rawPath: string | null,
): LatestBriefProjection | null {
  if (recommendation === null || rawPath === null) return null;
  const parsed = LatestBriefProjectionSchema.safeParse({
    recommendation,
    verification_path: rawPath,
  });
  return parsed.success ? parsed.data : null;
}

async function fetchLatestBriefRow(db: Db, caseId: string, organizationId: string) {
  return db
    .select({
      recommendation: briefsTable.recommendation,
      confidence: briefsTable.confidence,
      composed_at: briefsTable.composed_at,
      payload_json: briefsTable.payload_json,
    })
    .from(briefsTable)
    .where(and(eq(briefsTable.case_id, caseId), eq(briefsTable.organization_id, organizationId)))
    .orderBy(desc(briefsTable.composed_at))
    .limit(1)
    .get();
}

function resolveOverlay(raw: unknown): CaseOverlay | null {
  const parsed = CaseOverlaySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Lists cases visible to the viewer within their active organization. */
export async function listCasesForViewer(
  input: QueueSearch,
  viewer: ViewerContext,
  db: Db,
): Promise<QueueResponse> {
  const where = buildFilters(input, viewer);
  const orderBy = buildOrder(input.sort);
  const offset = (input.page - 1) * QUEUE_PAGE_SIZE;
  const projection = caseListProjection();
  const briefCols = latestBriefSubquery(sql`${casesTable.id}`);

  const [rows, totalRows] = await Promise.all([
    db
      .select({ ...projection, ...briefCols, clientSubmitted: clientSubmittedExpr() })
      .from(casesTable)
      .where(where)
      .orderBy(orderBy)
      .limit(QUEUE_PAGE_SIZE)
      .offset(offset)
      .all(),
    db.select({ value: count() }).from(casesTable).where(where).all(),
  ]);

  const total = totalRows[0]?.value ?? 0;
  return {
    cases: rows.map((row) =>
      mapCaseRow(
        row,
        resolveLatestBrief(row.latestRecommendation, row.latestVerificationPath),
        row.clientSubmitted === 1,
      ),
    ),
    page: input.page,
    pageSize: QUEUE_PAGE_SIZE,
    total,
  };
}

/**
 * Result of resolving a case by its exact title. `ambiguous` carries the match
 * count so the caller can tell the reviewer to disambiguate by id.
 */
export type TitleResolution =
  | { readonly status: "found"; readonly caseId: string }
  | { readonly status: "none" }
  | { readonly status: "ambiguous"; readonly count: number };

/**
 * Resolves an exact, case-insensitive title to a single org-scoped case id.
 * Exact (not fuzzy) so `get_case` by title returns one unambiguous case; the
 * fuzzy listing path is `listCasesForViewer` with `search.title`. Selects two
 * rows so a duplicate title surfaces as `ambiguous` rather than silently
 * picking one.
 */
export async function resolveCaseIdByTitle(
  title: string,
  viewer: ViewerContext,
  db: Db,
): Promise<TitleResolution> {
  const rows = await db
    .select({ id: casesTable.id })
    .from(casesTable)
    .where(
      and(
        eq(casesTable.organization_id, viewer.organizationId),
        sql`LOWER(${casesTable.title}) = LOWER(${title})`,
      ),
    )
    .limit(2)
    .all();
  const [first, second] = rows;
  if (!first) return { status: "none" };
  if (second) return { status: "ambiguous", count: rows.length };
  return { status: "found", caseId: first.id };
}

interface CaseDetailDraft {
  readonly case: CaseRow;
  readonly brief: BriefSummary | null;
  readonly overlay: CaseOverlay | null;
  readonly client_responded: boolean;
  readonly latest_action: ReviewerAction | null;
}

/**
 * Validates the assembled detail draft. Falls back to a brief-less shape if the
 * brief payload fails the schema (degraded brief row) so the reviewer still gets
 * the case rather than a hard error.
 */
function parseCaseDetail(draft: CaseDetailDraft): CaseDetailResponse | null {
  const parsed = CaseDetailResponseSchema.safeParse(draft);
  if (parsed.success) return parsed.data;
  const caseOnly = CaseDetailResponseSchema.safeParse({ ...draft, brief: null });
  return caseOnly.success ? caseOnly.data : null;
}

/** Loads one org-scoped case detail payload. */
export async function fetchCaseDetail(
  caseId: string,
  viewer: ViewerContext,
  db: Db,
): Promise<CaseDetailResponse | null> {
  const projection = {
    ...caseListProjection(),
    brief_partial_json: casesTable.brief_partial_json,
    clientSubmitted: clientSubmittedExpr(),
  };
  const row = await db
    .select(projection)
    .from(casesTable)
    .where(
      and(
        eq(casesTable.id, caseId),
        eq(casesTable.organization_id, viewer.organizationId),
        reviewerAssigneeFilter(viewer),
      ),
    )
    .get();
  if (!row) return null;

  const brief = await fetchLatestBriefRow(db, caseId, viewer.organizationId);
  const latestBrief = brief
    ? resolveLatestBrief(brief.recommendation, brief.payload_json?.verification_path ?? null)
    : null;

  const latest = await latestReviewerAction(db, caseId);
  const draft: CaseDetailDraft = {
    case: mapCaseRow(row, latestBrief, row.clientSubmitted === 1),
    brief: brief
      ? {
          recommendation: brief.recommendation,
          confidence: brief.confidence,
          composed_at: brief.composed_at.getTime(),
          payload_json: brief.payload_json,
        }
      : null,
    overlay: resolveOverlay(row.brief_partial_json),
    client_responded: await clientRespondedFor(db, caseId, latest),
    latest_action: latest?.action ?? null,
  };
  return parseCaseDetail(draft);
}

/**
 * Lists every brief composed for a case (newest run first), bounded by
 * `BRIEF_HISTORY_LIMIT`. Returns `null` when the case is not visible to the
 * viewer so the route can 404 — distinct from a visible case that simply has
 * no briefs yet, which returns `{ briefs: [] }`.
 */
export async function fetchBriefHistory(
  caseId: string,
  viewer: ViewerContext,
  db: Db,
): Promise<BriefHistoryResponse | null> {
  const caseRow = await db
    .select({ id: casesTable.id })
    .from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.organization_id, viewer.organizationId)))
    .get();
  if (!caseRow) return null;

  const rows = await db
    .select({
      run_id: briefsTable.run_id,
      recommendation: briefsTable.recommendation,
      confidence: briefsTable.confidence,
      composed_at: briefsTable.composed_at,
      payload_json: briefsTable.payload_json,
    })
    .from(briefsTable)
    .where(
      and(eq(briefsTable.case_id, caseId), eq(briefsTable.organization_id, viewer.organizationId)),
    )
    .orderBy(desc(briefsTable.composed_at))
    .limit(BRIEF_HISTORY_LIMIT)
    .all();

  return {
    briefs: rows.map((row) => ({
      run_id: row.run_id,
      recommendation: row.recommendation,
      confidence: row.confidence,
      composed_at: row.composed_at.getTime(),
      payload_json: row.payload_json,
    })),
  };
}

/** Loads the most recent brief for a case within the viewer's org. */
export async function loadBrief(caseId: string, viewer: ViewerContext, db: Db) {
  const caseRow = await db
    .select({ id: casesTable.id })
    .from(casesTable)
    .where(
      and(
        eq(casesTable.id, caseId),
        eq(casesTable.organization_id, viewer.organizationId),
        reviewerAssigneeFilter(viewer),
      ),
    )
    .get();
  if (!caseRow) throw new NotFoundError(`case not found: ${caseId}`);
  const brief = await fetchLatestBriefRow(db, caseId, viewer.organizationId);
  if (!brief) throw new NotFoundError(`brief not found for case: ${caseId}`);
  return brief;
}

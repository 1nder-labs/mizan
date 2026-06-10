/**
 * Shared case read helpers for HTTP routes and Mastra chat tools.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";
import { briefs as briefsTable, caseListProjection, cases as casesTable, type Db } from "@mizan/db";
import {
  buildQueueOrder,
  clientRespondedFromRow,
  isSubmittedForReview,
  latestActionCols,
  mapCaseRow,
} from "./queue-disposition.ts";
import { clientSubmittedExpr } from "./case-submitted-sql.ts";
import { buildFilters, reviewerAssigneeFilter } from "./queue-filters.ts";
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
  type ViewerContext,
} from "@mizan/shared";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Latest-brief projection for a queue row. The `briefs.case_id = cases.id`
 * correlation MUST be a LITERAL qualified identifier: `briefs` has its own `id`
 * column, so an interpolated `${cases.id}` renders unqualified inside this
 * SELECT-list subquery and binds to `briefs.id`, silently returning null. Same
 * footgun documented in `latest-action-sql.ts`.
 */
function latestBriefSubquery() {
  return {
    latestRecommendation: sql<string | null>`(
      SELECT recommendation FROM briefs
      WHERE briefs.case_id = cases.id
      ORDER BY briefs.composed_at DESC
      LIMIT 1
    )`,
    latestVerificationPath: sql<string | null>`(
      SELECT json_extract(payload_json, '$.verification_path') FROM briefs
      WHERE briefs.case_id = cases.id
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

/** Maps a persisted brief row to the wire `BriefSummary`, or null when absent. */
function toBriefSummary(
  brief: Awaited<ReturnType<typeof fetchLatestBriefRow>>,
): BriefSummary | null {
  if (!brief) return null;
  return {
    recommendation: brief.recommendation,
    confidence: brief.confidence,
    composed_at: brief.composed_at.getTime(),
    payload_json: brief.payload_json,
  };
}

/** Lists cases visible to the viewer within their active organization. */
export async function listCasesForViewer(
  input: QueueSearch,
  viewer: ViewerContext,
  db: Db,
): Promise<QueueResponse> {
  const where = buildFilters(input, viewer);
  const offset = (input.page - 1) * QUEUE_PAGE_SIZE;
  const projection = caseListProjection();
  const briefCols = latestBriefSubquery();

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        ...projection,
        ...briefCols,
        ...latestActionCols(),
        clientSubmitted: clientSubmittedExpr(),
        submittedAtMs: casesTable.submitted_at,
      })
      .from(casesTable)
      .where(where)
      .orderBy(...buildQueueOrder(input.sort))
      .limit(QUEUE_PAGE_SIZE)
      .offset(offset)
      .all(),
    db.select({ value: count() }).from(casesTable).where(where).all(),
  ]);

  const total = totalRows[0]?.value ?? 0;
  return {
    cases: rows.map((row) =>
      mapCaseRow(row, {
        latestBrief: resolveLatestBrief(row.latestRecommendation, row.latestVerificationPath),
        clientSubmitted: row.clientSubmitted === 1,
        latestAction: row.latestAction,
        clientResponded: clientRespondedFromRow(
          row.latestAction,
          row.latestActedAt,
          row.submittedAtMs?.getTime() ?? null,
        ),
        submitted: isSubmittedForReview(row.clientSubmitted, row.submittedAtMs),
      }),
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
        reviewerAssigneeFilter(viewer),
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
  readonly archived: boolean;
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
    ...latestActionCols(),
    brief_partial_json: casesTable.brief_partial_json,
    clientSubmitted: clientSubmittedExpr(),
    submittedAtMs: casesTable.submitted_at,
    archivedAtMs: casesTable.archived_at,
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
  const submittedAtMs = row.submittedAtMs?.getTime() ?? null;
  const draft: CaseDetailDraft = {
    case: mapCaseRow(row, {
      latestBrief,
      clientSubmitted: row.clientSubmitted === 1,
      latestAction: row.latestAction,
      clientResponded: clientRespondedFromRow(row.latestAction, row.latestActedAt, submittedAtMs),
      submitted: isSubmittedForReview(row.clientSubmitted, row.submittedAtMs),
    }),
    brief: toBriefSummary(brief),
    overlay: resolveOverlay(row.brief_partial_json),
    archived: row.archivedAtMs !== null,
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
    .where(
      and(
        eq(casesTable.id, caseId),
        eq(casesTable.organization_id, viewer.organizationId),
        reviewerAssigneeFilter(viewer),
      ),
    )
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

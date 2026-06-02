/**
 * Shared case read helpers for HTTP routes and Mastra chat tools.
 */
import { and, asc, count, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { briefs as briefsTable, caseListProjection, cases as casesTable, type Db } from "@mizan/db";
import {
  CaseDetailResponseSchema,
  CaseOverlaySchema,
  LatestBriefProjectionSchema,
  QUEUE_PAGE_SIZE,
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
function mapCaseRow(row: PublicCaseColumns, latestBrief: LatestBriefProjection | null): CaseRow {
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
  };
}

function resolveAssigneeFilter(search: QueueSearch, viewer: ViewerContext): SQL | undefined {
  const explicit = search.assignee;
  const effective = explicit ?? (viewer.role === "admin" ? "all" : "me");
  if (effective === "all") return undefined;
  if (effective === "unassigned") return isNull(casesTable.assigned_to);
  if (effective === "me") {
    return or(eq(casesTable.assigned_to, viewer.userId), isNull(casesTable.assigned_to));
  }
  return eq(casesTable.assigned_to, effective);
}

function buildFilters(search: QueueSearch, viewer: ViewerContext): SQL {
  const filters: SQL[] = [eq(casesTable.organization_id, viewer.organizationId)];
  if (search.status) filters.push(eq(casesTable.status, search.status));
  if (search.category) filters.push(eq(casesTable.category, search.category));
  if (search.geography) filters.push(eq(casesTable.geography, search.geography));
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
  if (raw === null || raw === undefined) return null;
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
      .select({ ...projection, ...briefCols })
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
      mapCaseRow(row, resolveLatestBrief(row.latestRecommendation, row.latestVerificationPath)),
    ),
    page: input.page,
    pageSize: QUEUE_PAGE_SIZE,
    total,
  };
}

/** Loads one org-scoped case detail payload. */
export async function fetchCaseDetail(
  caseId: string,
  viewer: ViewerContext,
  db: Db,
): Promise<CaseDetailResponse | null> {
  const projection = { ...caseListProjection(), brief_partial_json: casesTable.brief_partial_json };
  const row = await db
    .select(projection)
    .from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.organization_id, viewer.organizationId)))
    .get();
  if (!row) return null;

  const brief = await fetchLatestBriefRow(db, caseId, viewer.organizationId);
  const latestBrief = brief
    ? resolveLatestBrief(brief.recommendation, brief.payload_json?.verification_path ?? null)
    : null;

  const draft = {
    case: mapCaseRow(row, latestBrief),
    brief: brief
      ? {
          recommendation: brief.recommendation,
          confidence: brief.confidence,
          composed_at: brief.composed_at.getTime(),
          payload_json: brief.payload_json,
        }
      : null,
    overlay: resolveOverlay(row.brief_partial_json),
  };

  const parsed = CaseDetailResponseSchema.safeParse(draft);
  if (parsed.success) return parsed.data;
  const caseOnly = CaseDetailResponseSchema.safeParse({
    case: draft.case,
    brief: null,
    overlay: draft.overlay,
  });
  return caseOnly.success ? caseOnly.data : null;
}

/** Loads the most recent brief for a case within the viewer's org. */
export async function loadBrief(caseId: string, viewer: ViewerContext, db: Db) {
  const caseRow = await db
    .select({ id: casesTable.id })
    .from(casesTable)
    .where(and(eq(casesTable.id, caseId), eq(casesTable.organization_id, viewer.organizationId)))
    .get();
  if (!caseRow) throw new NotFoundError(`case not found: ${caseId}`);
  const brief = await fetchLatestBriefRow(db, caseId, viewer.organizationId);
  if (!brief) throw new NotFoundError(`brief not found for case: ${caseId}`);
  return brief;
}

/**
 * Queue-list + case-detail read handlers.
 *
 * Kept in a separate file from the brief-stream chain so the
 * 400 LOC ceiling holds on `cases.ts` after Phase 5 grew it.
 * Both routes are mounted into `caseRoutes` under the same
 * `requireRole(["reviewer", "admin"])` chain.
 */

import { zValidator } from "@hono/zod-validator";
import { count, desc, eq, asc, and, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  caseListProjection,
  makeDb,
  briefs as briefsTable,
  cases as casesTable,
  type Db,
} from "@mizan/db";
import {
  CaseOverlaySchema,
  QUEUE_PAGE_SIZE,
  QueueResponseSchema,
  QueueSearchSchema,
  CaseDetailResponseSchema,
  VerificationPathSchema,
  type CaseDetailResponse,
  type CaseOverlay,
  type QueueSearch,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import type { ProducerVariables } from "../middleware/producer-guard.ts";

const ParamIdSchema = z.object({ id: z.string().uuid() });

interface ViewerContext {
  readonly userId: string;
  readonly role: "reviewer" | "admin";
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

function buildFilters(search: QueueSearch, viewer: ViewerContext): SQL | undefined {
  const filters: SQL[] = [];
  if (search.status) filters.push(eq(casesTable.status, search.status));
  if (search.category) filters.push(eq(casesTable.category, search.category));
  if (search.geography) filters.push(eq(casesTable.geography, search.geography));
  const assignee = resolveAssigneeFilter(search, viewer);
  if (assignee) filters.push(assignee);
  if (filters.length === 0) return undefined;
  return filters.length === 1 ? filters[0] : and(...filters);
}

function buildOrder(sort: QueueSearch["sort"]): SQL {
  if (sort === "updated_asc") return asc(casesTable.updated_at);
  if (sort === "created_desc") return desc(casesTable.created_at);
  return desc(casesTable.updated_at);
}

/**
 * Extracts the latest brief's recommendation + verification_path for a
 * given case from the briefs table. Uses a correlated subquery selecting
 * the most-recent composed_at row so the JOIN is a single lookup per case.
 *
 * Returns null fields when no brief exists for the case.
 */
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

/**
 * Converts a raw DB recommendation + verification_path pair from the
 * correlated subquery into the typed `latest_brief` shape.
 * Returns null when the case has no brief.
 */
/**
 * `safeParse` over `parse` so a single corrupt brief row (legacy
 * verification_path string the enum no longer recognises) degrades
 * its row's `latest_brief` to null instead of 500-ing the whole
 * queue list. The status badge column still renders; the reviewer
 * loses only the recommendation chip for that row.
 */
function resolveLatestBrief(
  recommendation: string | null,
  rawPath: string | null,
): { recommendation: string; verification_path: string } | null {
  if (recommendation === null || rawPath === null) return null;
  const parsed = VerificationPathSchema.safeParse(rawPath);
  if (!parsed.success) return null;
  return { recommendation, verification_path: parsed.data };
}

/**
 * Latest brief row for a case — narrow projection so the wire payload
 * stays bounded. Extracted from `fetchDetailPayload` to keep that
 * function under the 50 LOC ceiling.
 */
async function fetchLatestBriefRow(db: Db, caseId: string) {
  return db
    .select({
      recommendation: briefsTable.recommendation,
      confidence: briefsTable.confidence,
      composed_at: briefsTable.composed_at,
      payload_json: briefsTable.payload_json,
    })
    .from(briefsTable)
    .where(eq(briefsTable.case_id, caseId))
    .orderBy(desc(briefsTable.composed_at))
    .limit(1)
    .get();
}

type CaseRowProjection = Awaited<ReturnType<typeof fetchLatestBriefRow>>;

function resolveOverlay(raw: unknown): CaseOverlay | null {
  if (raw === null || raw === undefined) return null;
  const parsed = CaseOverlaySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function buildDetailDraft(
  row: { readonly [k: string]: unknown } & {
    id: string;
    status: string;
    category: string;
    geography: string;
    claimed_zakat_category: string | null;
    created_at: Date;
    updated_at: Date;
    brief_partial_json: unknown;
    assigned_to: string | null;
  },
  brief: CaseRowProjection,
  latestBrief: { recommendation: string; verification_path: string } | null,
) {
  return {
    case: {
      id: row.id,
      status: row.status,
      category: row.category,
      geography: row.geography,
      claimed_zakat_category: row.claimed_zakat_category,
      created_at: row.created_at.getTime(),
      updated_at: row.updated_at.getTime(),
      latest_brief: latestBrief,
      assigned_to: row.assigned_to,
    },
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
}

/**
 * Fetches the case row + latest brief from D1 and assembles the validated
 * `CaseDetailResponse` payload. Returns null when the case does not exist.
 * On a malformed brief payload the response degrades to `brief: null`
 * so the reviewer surface still loads instead of 500-ing.
 */
async function fetchDetailPayload(db: Db, id: string): Promise<CaseDetailResponse | null> {
  const projection = { ...caseListProjection(), brief_partial_json: casesTable.brief_partial_json };
  const row = await db.select(projection).from(casesTable).where(eq(casesTable.id, id)).get();
  if (!row) return null;

  const brief = await fetchLatestBriefRow(db, id);
  const latestBrief = brief
    ? resolveLatestBrief(brief.recommendation, brief.payload_json?.verification_path ?? null)
    : null;

  const draft = buildDetailDraft(row, brief, latestBrief);
  const parsed = CaseDetailResponseSchema.safeParse(draft);
  if (parsed.success) return parsed.data;

  console.error(`[cases-list] case-detail parse degraded (id=${id}):`, parsed.error.message);
  const caseOnly = CaseDetailResponseSchema.safeParse({
    case: draft.case,
    brief: null,
    overlay: draft.overlay,
  });
  if (caseOnly.success) return caseOnly.data;

  console.error(`[cases-list] case-detail full parse failed (id=${id}):`, caseOnly.error.message);
  return null;
}

export const casesListRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ProducerVariables;
}>()
  .get("/", zValidator("query", QueueSearchSchema), async (c) => {
    const search = c.req.valid("query");
    const db = makeDb(c.env.DB);
    const viewer: ViewerContext = { userId: c.var.user.id, role: c.var.user.role };
    const where = buildFilters(search, viewer);
    const orderBy = buildOrder(search.sort);
    const offset = (search.page - 1) * QUEUE_PAGE_SIZE;

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

    const payload = QueueResponseSchema.parse({
      cases: rows.map((row) => ({
        id: row.id,
        status: row.status,
        category: row.category,
        geography: row.geography,
        claimed_zakat_category: row.claimed_zakat_category,
        created_at: row.created_at.getTime(),
        updated_at: row.updated_at.getTime(),
        latest_brief: resolveLatestBrief(row.latestRecommendation, row.latestVerificationPath),
        assigned_to: row.assigned_to,
      })),
      page: search.page,
      pageSize: QUEUE_PAGE_SIZE,
      total,
    });

    return c.json(payload);
  })
  .get("/:id", zValidator("param", ParamIdSchema), async (c) => {
    const { id } = c.req.valid("param");
    const db = makeDb(c.env.DB);
    const payload = await fetchDetailPayload(db, id);
    if (!payload) return c.json({ error: "not_found" }, 404);
    return c.json(payload);
  });
